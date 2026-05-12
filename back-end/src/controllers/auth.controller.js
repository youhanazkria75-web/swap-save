const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");
const asyncHandler = require("../utils/asyncHandler");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../config/email");
const { grantProfileCompleteRewardIfEligible, grantSignupBonus } = require("../utils/wallet");
const { resetPhoneVerificationState } = require("../utils/phoneVerification");
const { BLOCKED_ACCOUNT_MESSAGE, isEmailBlocked } = require("../utils/blockedAccounts");
const egyptLocationsDataset = require("../config/egypt_locations_english_dropdown_dataset.json");

// helper: create token
const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const createEmailVerificationToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  return { token, tokenHash };
};

const createPasswordResetToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  return { token, tokenHash };
};

const getFrontendUrl = () => process.env.FRONTEND_URL || "http://localhost:3000";
const getGoogleCallbackUrl = () =>
  process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/auth/google/callback";
const getAdminEmail = () => (process.env.ADMIN_EMAIL || "admin@swap-save.com").toLowerCase();
const EGYPT_COUNTRY = "Egypt";
const isStrongPassword = (password) =>
  typeof password === "string" &&
  password.length >= 8 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
const getRequestString = (value) => (typeof value === "string" ? value.trim() : "");

const getEgyptLocation = (city) =>
  egyptLocationsDataset.find((location) => location.city === city);

const getEgyptArea = (city, area) =>
  (getEgyptLocation(city)?.areas || []).find((item) => item.name === area);

const validateSignupLocation = ({ country, city, area }) => {
  if (country !== EGYPT_COUNTRY) {
    return { error: "Country must be Egypt" };
  }

  if (!city) {
    return { error: "City is required" };
  }

  const location = getEgyptLocation(city);
  if (!location) {
    return { error: "City must be a supported Egypt city" };
  }

  if (!area) {
    return { error: "Area is required" };
  }

  const areaEntry = getEgyptArea(city, area);
  if (!areaEntry) {
    return { error: "Area must belong to the selected city" };
  }

  return { location, areaEntry };
};

const toPublicUser = (user) => ({
  id: user._id,
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  avatar: user.avatar || "",
  phone: user.phone || "",
  bio: user.bio || "",
  country: user.country || "",
  city: user.city || "",
  area: user.area || "",
  street_address: user.street_address || "",
  address: user.street_address || "",
  isEmailVerified: user.isEmailVerified,
  isPhoneVerified: Boolean(user.isPhoneVerified),
  role: user.role,
  rating: user.rating || 0,
  rating_count: user.rating_count || 0,
  coin_balance: user.coins || 0,
  coins: user.coins || 0,
  held_coins: user.held_coins || 0,
  total_coins_earned: user.total_coins_earned || 0,
  total_coins_spent: user.total_coins_spent || 0,
  monthly_free_swaps_used: user.monthly_free_swaps_used || 0,
  extra_swap_slots: user.extra_swap_slots || 0,
  priority_matches_available: user.priority_matches_available || 0,
  phone_verification_reward_granted: Boolean(user.phone_verification_reward_granted),
  profile_complete_reward_granted: Boolean(user.profile_complete_reward_granted),
});

const createGoogleState = (source = "login") => {
  return jwt.sign(
    {
      provider: "google",
      source,
      nonce: crypto.randomBytes(16).toString("hex"),
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );
};

const parseName = (profile) => {
  const fallbackName = profile.name || profile.email.split("@")[0];
  const [firstName, ...rest] = fallbackName.trim().split(/\s+/);

  return {
    first_name: profile.given_name || firstName || "Google",
    last_name: profile.family_name || rest.join(" ") || "User",
  };
};

const redirectGoogleError = (res, message) => {
  const url = new URL("/auth/google/callback", getFrontendUrl());
  url.searchParams.set("error", message);
  return res.redirect(url.toString());
};

const setVerificationTokenAndSendEmail = async (user) => {
  const { token: verificationToken, tokenHash } = createEmailVerificationToken();

  user.isEmailVerified = false;
  user.emailVerificationToken = tokenHash;
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();

  const verificationUrl = `${getFrontendUrl()}/verify-email?token=${verificationToken}`;

  await sendVerificationEmail({
    to: user.email,
    name: user.first_name,
    verificationUrl,
  });
};

// POST /auth/register
exports.register = asyncHandler(async (req, res) => {
  const first_name = getRequestString(req.body.first_name);
  const last_name = getRequestString(req.body.last_name);
  const email = getRequestString(req.body.email).toLowerCase();
  const password = req.body.password;
  const phone = getRequestString(req.body.phone);
  const bio = getRequestString(req.body.bio);
  const country = getRequestString(req.body.country);
  const city = getRequestString(req.body.city);
  const area = getRequestString(req.body.area);
  const streetAddress = getRequestString(req.body.street_address ?? req.body.streetAddress);

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  if (await isEmailBlocked(email)) {
    return res.status(403).json({ message: BLOCKED_ACCOUNT_MESSAGE });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
    });
  }

  const locationValidation = validateSignupLocation({ country, city, area });
  if (locationValidation.error) {
    return res.status(400).json({ message: locationValidation.error });
  }

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  let user = await User.create({
    first_name,
    last_name,
    email,
    password: hashedPassword,
    phone,
    country,
    city,
    area,
    street_address: streetAddress,
    address: streetAddress,
    isEmailVerified: false,
    coins: 0,
    held_coins: 0,
    total_coins_earned: 0,
    total_coins_spent: 0,
    monthly_free_swaps_used: 0,
    extra_swap_slots: 0,
    priority_matches_available: 0,
    signup_bonus_granted: false,
  });

  user = await grantSignupBonus(user._id, { source: "email_signup" });
  await setVerificationTokenAndSendEmail(user);

  return res.status(201).json({
    message: "Registered successfully. Please verify your email.",
    user: {
      ...toPublicUser(user),
    },
  });
});

// POST /auth/resend-verification-email
exports.resendVerificationEmail = asyncHandler(async (req, res) => {
  const email = getRequestString(req.body.email).toLowerCase();

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await User.findOne({ email }).select("+emailVerificationToken +emailVerificationExpires");

  if (!user) {
    return res.status(200).json({
      message: "If an account exists and still needs verification, a verification email has been sent.",
    });
  }

  if (user.isEmailVerified) {
    return res.status(200).json({
      message: "If an account exists and still needs verification, a verification email has been sent.",
    });
  }

  await setVerificationTokenAndSendEmail(user);

  return res.status(200).json({
    message: "If an account exists and still needs verification, a verification email has been sent.",
  });
});

// POST /auth/forgot-password
exports.forgotPassword = asyncHandler(async (req, res) => {
  const email = getRequestString(req.body.email).toLowerCase();

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = await User.findOne({ email }).select("+passwordResetToken +passwordResetExpires");

  if (user) {
    const { token, tokenHash } = createPasswordResetToken();

    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetUrl = `${getFrontendUrl()}/reset-password?token=${token}`;

    await sendPasswordResetEmail({
      to: user.email,
      name: user.first_name,
      resetUrl,
    });
  }

  return res.status(200).json({
    message: "If an account exists for this email, a password reset link has been sent.",
  });
});

// POST /auth/reset-password
exports.resetPassword = asyncHandler(async (req, res) => {
  const token = getRequestString(req.body.token);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!token || !password) {
    return res.status(400).json({ message: "Reset token and new password are required" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
    });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOneAndUpdate(
    {
      passwordResetToken: tokenHash,
      passwordResetExpires: { $gt: new Date(Date.now()) },
    },
    {
      $set: { password: hashedPassword },
      $unset: {
        passwordResetToken: "",
        passwordResetExpires: "",
      },
    },
    { new: true }
  );

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired reset link" });
  }

  return res.status(200).json({ message: "Password reset successful" });
});

// GET /auth/verify-email?token=...
exports.verifyEmail = asyncHandler(async (req, res) => {
  const token = getRequestString(req.query.token);

  if (!token) {
    return res.status(400).json({ message: "Verification token is required" });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    emailVerificationToken: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
  }).select("+emailVerificationToken +emailVerificationExpires");

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired verification token" });
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpires = null;
  await user.save();
  const authToken = createToken(user._id);

  return res.status(200).json({
    message: "Email verified successfully",
    token: authToken,
    user: {
      ...toPublicUser(user),
    },
  });
});

// POST /auth/login
exports.login = asyncHandler(async (req, res) => {
  const email = getRequestString(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  if (await isEmailBlocked(email)) {
    return res.status(403).json({ message: BLOCKED_ACCOUNT_MESSAGE });
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user || user.is_deleted) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (user.role !== "admin" && user.isEmailVerified !== true) {
    return res.status(403).json({ message: "Please verify your email before logging in." });
  }

  const token = createToken(user._id);

  return res.status(200).json({
    message: "Login successful",
    token,
    user: {
      ...toPublicUser(user),
    },
  });
});

// GET /auth/me
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user || user.is_deleted) {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (user.role !== "admin" && user.isEmailVerified !== true) {
    return res.status(403).json({ message: "Please verify your email before continuing." });
  }

  return res.status(200).json({
    user: {
      ...toPublicUser(user),
    },
  });
});

// PUT /auth/update-profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user || user.is_deleted) {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (user.role !== "admin" && user.isEmailVerified !== true) {
    return res.status(403).json({ message: "Please verify your email before continuing." });
  }

  const firstName = typeof req.body.first_name === "string" ? req.body.first_name.trim() : "";
  const lastName = typeof req.body.last_name === "string" ? req.body.last_name.trim() : "";
  const phone = getRequestString(req.body.phone);
  const bio = getRequestString(req.body.bio);
  const country = getRequestString(req.body.country);
  const city = getRequestString(req.body.city);
  const area = getRequestString(req.body.area);
  const streetAddress = getRequestString(req.body.street_address ?? req.body.streetAddress);

  if (!firstName || !lastName) {
    return res.status(400).json({
      message: "first_name and last_name are required",
    });
  }

  if (phone !== (user.phone || "")) {
    resetPhoneVerificationState(user);
  }

  user.first_name = firstName;
  user.last_name = lastName;
  user.phone = phone;
  user.bio = bio;
  user.country = country;
  user.city = city;
  user.area = area;
  user.street_address = streetAddress;
  user.address = streetAddress;
  await user.save();

  const profileReward = await grantProfileCompleteRewardIfEligible(user, {
    source: "auth_update_profile",
  });
  const responseUser = profileReward.user || user;

  return res.status(200).json({
    message: "Profile updated successfully",
    user: {
      ...toPublicUser(responseUser),
    },
  });
});

// GET /auth/google
exports.startGoogleAuth = asyncHandler(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ message: "Google OAuth is not configured" });
  }

  const source = req.query.source === "signup" ? "signup" : "login";
  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  googleAuthUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", getGoogleCallbackUrl());
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", createGoogleState(source));
  googleAuthUrl.searchParams.set("prompt", "select_account");

  return res.redirect(googleAuthUrl.toString());
});

// GET /auth/google/callback
exports.googleCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return redirectGoogleError(res, "Missing Google authorization data");
  }

  try {
    const decodedState = jwt.verify(state, process.env.JWT_SECRET);

    if (decodedState.provider !== "google") {
      return redirectGoogleError(res, "Invalid Google OAuth state");
    }
  } catch (_error) {
    return redirectGoogleError(res, "Invalid or expired Google OAuth state");
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirectGoogleError(res, "Google OAuth is not configured");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: getGoogleCallbackUrl(),
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    return redirectGoogleError(res, "Google token exchange failed");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const profile = await profileResponse.json();

  if (!profileResponse.ok || !profile.email) {
    return redirectGoogleError(res, "Could not load Google profile");
  }

  if (profile.email_verified !== true) {
    return redirectGoogleError(res, "Google email is not verified");
  }

  const email = profile.email.toLowerCase();

  if (await isEmailBlocked(email)) {
    return redirectGoogleError(res, BLOCKED_ACCOUNT_MESSAGE);
  }

  let user = await User.findOne({ email }).select("+emailVerificationToken +emailVerificationExpires");

  if (user) {
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;

    if (email === getAdminEmail()) {
      user.role = "admin";
    }

    await user.save();
  } else {
    const { first_name, last_name } = parseName(profile);
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(randomPassword, salt);

    user = await User.create({
      first_name,
      last_name,
      email,
      password: hashedPassword,
      address: "",
      role: email === getAdminEmail() ? "admin" : "user",
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      coins: 0,
      held_coins: 0,
      total_coins_earned: 0,
      total_coins_spent: 0,
      monthly_free_swaps_used: 0,
      extra_swap_slots: 0,
      priority_matches_available: 0,
      signup_bonus_granted: false,
    });

    user = await grantSignupBonus(user._id, { source: "google_signup" });
  }

  const authToken = createToken(user._id);
  const callbackUrl = new URL("/auth/google/callback", getFrontendUrl());
  const payload = Buffer.from(
    JSON.stringify({
      token: authToken,
      user: toPublicUser(user),
    })
  ).toString("base64url");

  callbackUrl.searchParams.set("data", payload);

  return res.redirect(callbackUrl.toString());
});
