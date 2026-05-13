const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Product = require("../models/Product");
const Rating = require("../models/Rating");
const SwapRequest = require("../models/SwapRequest");
const asyncHandler = require("../utils/asyncHandler");
const {
  EXTRA_SWAP_SLOT_COST,
  PRIORITY_MATCHING_COST,
  getWalletSummary,
  grantPhoneVerificationRewardIfEligible,
  grantProfileCompleteRewardIfEligible,
  spendCoins,
} = require("../utils/wallet");
const {
  calculateProfileCompleteness,
  getUserMetrics,
} = require("../utils/trustMetrics");
const {
  checkPhoneVerificationCode: checkTwilioPhoneVerificationCode,
  isTwilioConfigurationError,
  sendPhoneVerificationCode: sendTwilioPhoneVerificationCode,
} = require("../config/twilio");
const {
  PHONE_VERIFICATION_COOLDOWN_MS,
  PHONE_VERIFICATION_DAILY_SEND_LIMIT,
  clearPhoneVerificationMetadata,
  getPhoneVerificationDateKey,
  normalizePhoneNumberForVerification,
  resetPhoneVerificationState,
} = require("../utils/phoneVerification");
const { buildAvatarUrl } = require("../utils/uploadUrls");
const { avatarUploadRoot } = require("../middlewares/upload.middleware");
const {
  isCloudinaryConfigured,
  uploadImageFiles,
} = require("../services/cloudinary.service");

const ACTIVE_SWAP_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
  "disputed",
];

const DEFAULT_NOTIFICATION_PREFERENCES = {
  swap_requests_enabled: true,
  new_messages_enabled: true,
  admin_decisions_enabled: true,
  new_ratings_enabled: true,
  promotions_enabled: false,
  weekly_digest_enabled: true,
};

const getString = (value) => (typeof value === "string" ? value.trim() : "");

const getNotificationPreferences = (user) => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  ...(user.notification_preferences?.toObject
    ? user.notification_preferences.toObject()
    : user.notification_preferences || {}),
});

const serializeAccountUser = (user, metrics = {}) => ({
  _id: user._id,
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
  role: user.role,
  isEmailVerified: Boolean(user.isEmailVerified),
  isPhoneVerified: Boolean(user.isPhoneVerified),
  rating: metrics.rating ?? user.rating ?? 0,
  rating_count: metrics.rating_count ?? user.rating_count ?? 0,
  completed_swaps: metrics.completed_swaps ?? 0,
  total_swaps: metrics.total_swaps ?? metrics.completed_swaps ?? 0,
  active_listings_count: metrics.active_listings_count ?? 0,
  trust_score: metrics.trust_score ?? 0,
  profile_completeness: metrics.profile_completeness ?? calculateProfileCompleteness(user),
  coin_balance: user.coins ?? 0,
  coins: user.coins ?? 0,
  held_coins: user.held_coins ?? 0,
  total_coins_earned: user.total_coins_earned ?? 0,
  total_coins_spent: user.total_coins_spent ?? 0,
  monthly_free_swaps_used: user.monthly_free_swaps_used ?? 0,
  extra_swap_slots: user.extra_swap_slots ?? 0,
  priority_matches_available: user.priority_matches_available ?? 0,
  phone_verification_reward_granted: Boolean(user.phone_verification_reward_granted),
  profile_complete_reward_granted: Boolean(user.profile_complete_reward_granted),
  two_factor_enabled: Boolean(user.two_factor_enabled),
  login_alerts_enabled: Boolean(user.login_alerts_enabled),
  active_sessions_count: 1,
  notification_preferences: getNotificationPreferences(user),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const serializePublicUser = (user, metrics = {}) => ({
  _id: user._id,
  id: user._id,
  first_name: user.first_name,
  last_name: user.last_name,
  avatar: user.avatar || "",
  bio: user.bio || "",
  country: user.country || "",
  city: user.city || "",
  area: user.area || "",
  rating: metrics.rating ?? user.rating ?? 0,
  rating_count: metrics.rating_count ?? user.rating_count ?? 0,
  completed_swaps: metrics.completed_swaps ?? 0,
  total_swaps: metrics.total_swaps ?? metrics.completed_swaps ?? 0,
  active_listings_count: metrics.active_listings_count ?? 0,
  trust_score: metrics.trust_score ?? 0,
  profile_completeness: metrics.profile_completeness ?? calculateProfileCompleteness(user),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const serializePublicRater = (rater) => {
  if (!rater || rater.is_deleted) {
    return {
      _id: rater?._id || null,
      id: rater?._id || null,
      first_name: "Deleted",
      last_name: "user",
      avatar: "",
      is_deleted: true,
    };
  }

  return {
    _id: rater._id,
    id: rater._id,
    first_name: rater.first_name,
    last_name: rater.last_name,
    avatar: rater.avatar || "",
  };
};

const serializeRating = (rating) => ({
  _id: rating._id,
  swap: rating.swap,
  rater: serializePublicRater(rating.rater),
  rated_user: rating.rated_user,
  score: rating.score,
  tags: rating.tags,
  comment: rating.comment,
  createdAt: rating.createdAt,
  updatedAt: rating.updatedAt,
});

const getAuthenticatedUser = async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user || user.is_deleted) {
    res.status(401).json({ message: "Invalid token" });
    return null;
  }

  return user;
};

const getAccountResponse = async (user) => {
  const metrics = await getUserMetrics(user);

  return {
    user: serializeAccountUser(user, metrics),
  };
};

const removeLocalAvatar = (avatarUrl) => {
  if (!avatarUrl || typeof avatarUrl !== "string") {
    return;
  }

  const marker = "/uploads/avatars/";
  const markerIndex = avatarUrl.indexOf(marker);

  if (markerIndex === -1) {
    return;
  }

  const filename = path.basename(avatarUrl.slice(markerIndex + marker.length));
  const filePath = path.join(avatarUploadRoot, filename);
  const relativePath = path.relative(avatarUploadRoot, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return;
  }

  fs.promises.unlink(filePath).catch(() => {});
};

const getTwilioHttpStatus = (error) =>
  Number(error?.status || error?.statusCode || 0);

const sendTwilioFailure = (res, error, fallbackMessage) => {
  if (isTwilioConfigurationError(error)) {
    return res.status(500).json({ message: error.message });
  }

  const status = getTwilioHttpStatus(error);

  if (status === 400 || status === 404) {
    return res.status(400).json({ message: fallbackMessage });
  }

  if (status === 429) {
    return res.status(429).json({
      message: "Verification provider rate limit reached. Please try again later.",
    });
  }

  return res.status(502).json({ message: fallbackMessage });
};

exports.getMe = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  return res.status(200).json(await getAccountResponse(user));
});

exports.getWallet = asyncHandler(async (req, res) => {
  const wallet = await getWalletSummary(req.userId);

  if (!wallet) {
    return res.status(401).json({ message: "Invalid token" });
  }

  return res.status(200).json({ wallet });
});

exports.buyExtraSwapSlot = asyncHandler(async (req, res) => {
  await spendCoins({
    userId: req.userId,
    amount: EXTRA_SWAP_SLOT_COST,
    type: "extra_swap_slot",
    description: `Purchased one extra swap request slot for ${EXTRA_SWAP_SLOT_COST} coins`,
    extraIncrement: { extra_swap_slots: 1 },
    metadata: {
      slots_added: 1,
    },
  });

  const wallet = await getWalletSummary(req.userId);

  return res.status(200).json({
    message: "Extra swap slot purchased",
    wallet,
  });
});

exports.buyPriorityMatching = asyncHandler(async (req, res) => {
  await spendCoins({
    userId: req.userId,
    amount: PRIORITY_MATCHING_COST,
    type: "priority_matching",
    description: `Purchased one priority matching credit for ${PRIORITY_MATCHING_COST} coins`,
    extraIncrement: { priority_matches_available: 1 },
    metadata: {
      credits_added: 1,
    },
  });

  const wallet = await getWalletSummary(req.userId);

  return res.status(200).json({
    message: "Priority matching credit purchased",
    wallet,
  });
});

exports.sendPhoneVerificationCode = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  if (!user.phone) {
    return res.status(400).json({ message: "Add a phone number before verifying it." });
  }

  if (user.isPhoneVerified) {
    return res.status(400).json({ message: "Phone number is already verified." });
  }

  const normalizedPhone = normalizePhoneNumberForVerification(user.phone);
  const now = new Date();
  const lastSentAt = user.phone_verification_last_sent_at
    ? new Date(user.phone_verification_last_sent_at)
    : null;

  if (lastSentAt && now.getTime() - lastSentAt.getTime() < PHONE_VERIFICATION_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil(
      (PHONE_VERIFICATION_COOLDOWN_MS - (now.getTime() - lastSentAt.getTime())) / 1000
    );

    return res.status(429).json({
      message: "Please wait before requesting another verification code.",
      retry_after_seconds: retryAfterSeconds,
    });
  }

  const today = getPhoneVerificationDateKey(now);
  const sendCount = user.phone_verification_send_count_date === today
    ? Number(user.phone_verification_send_count || 0)
    : 0;

  if (sendCount >= PHONE_VERIFICATION_DAILY_SEND_LIMIT) {
    return res.status(429).json({
      message: "Daily verification code limit reached. Please try again tomorrow.",
    });
  }

  try {
    await sendTwilioPhoneVerificationCode(normalizedPhone);
  } catch (error) {
    return sendTwilioFailure(
      res,
      error,
      "Could not send verification code to this phone number."
    );
  }

  user.phone = normalizedPhone;
  user.phone_verification_last_sent_at = now;
  user.phone_verification_send_count = sendCount + 1;
  user.phone_verification_send_count_date = today;
  await user.save();

  return res.status(200).json({ message: "Verification code sent." });
});

exports.verifyPhoneVerificationCode = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  const code = getString(req.body.code);

  if (!code) {
    return res.status(400).json({ message: "Verification code is required." });
  }

  if (!user.phone) {
    return res.status(400).json({ message: "Add a phone number before verifying it." });
  }

  const normalizedPhone = normalizePhoneNumberForVerification(user.phone);

  if (user.isPhoneVerified) {
    const wallet = await getWalletSummary(req.userId);

    return res.status(200).json({
      message: "Phone already verified.",
      ...(await getAccountResponse(user)),
      wallet,
      reward_granted: false,
    });
  }

  let verificationCheck;

  try {
    verificationCheck = await checkTwilioPhoneVerificationCode({
      to: normalizedPhone,
      code,
    });
  } catch (error) {
    return sendTwilioFailure(
      res,
      error,
      "Invalid or expired verification code."
    );
  }

  if (verificationCheck?.status !== "approved" && verificationCheck?.valid !== true) {
    return res.status(400).json({ message: "Invalid or expired verification code." });
  }

  const wasPhoneVerified = Boolean(user.isPhoneVerified);
  user.phone = normalizedPhone;
  user.isPhoneVerified = true;
  clearPhoneVerificationMetadata(user);
  await user.save();

  const reward = await grantPhoneVerificationRewardIfEligible(user, {
    wasPhoneVerified,
    metadata: {
      source: "twilio_verify",
    },
  });
  const responseUser = reward.user || user;
  const wallet = await getWalletSummary(req.userId);

  return res.status(200).json({
    message: "Phone verified successfully.",
    ...(await getAccountResponse(responseUser)),
    wallet,
    reward_granted: Boolean(reward.granted),
  });
});

exports.updateMe = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  const firstName = getString(req.body.first_name ?? req.body.firstName);
  const lastName = getString(req.body.last_name ?? req.body.lastName);
  const phone = getString(req.body.phone);
  const bio = getString(req.body.bio);
  const country = getString(req.body.country);
  const city = getString(req.body.city);
  const area = getString(req.body.area);
  const streetAddress = getString(req.body.street_address ?? req.body.streetAddress);

  if (!firstName || !lastName) {
    return res.status(400).json({ message: "First name and last name are required" });
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
    source: "profile_update",
  });
  const responseUser = profileReward.user || user;

  return res.status(200).json({
    message: "Profile updated successfully",
    ...(await getAccountResponse(responseUser)),
  });
});

exports.uploadAvatar = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  if (!req.file) {
    return res.status(400).json({ message: "Avatar image is required" });
  }

  const previousAvatar = user.avatar;
  user.avatar = isCloudinaryConfigured()
    ? (await uploadImageFiles([req.file], "swap-save/avatars"))[0].secure_url
    : buildAvatarUrl(req, req.file.filename);
  await user.save();

  removeLocalAvatar(previousAvatar);

  const profileReward = await grantProfileCompleteRewardIfEligible(user, {
    source: "avatar_upload",
  });
  const responseUser = profileReward.user || user;

  return res.status(200).json({
    message: "Profile image updated successfully",
    ...(await getAccountResponse(responseUser)),
  });
});

exports.updatePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select("+password");

  if (!user || user.is_deleted) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const currentPassword = getString(req.body.current_password ?? req.body.currentPassword);
  const newPassword = getString(req.body.new_password ?? req.body.newPassword);

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current password and new password are required" });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: "New password must be at least 8 characters" });
  }

  const matches = await bcrypt.compare(currentPassword, user.password);

  if (!matches) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  return res.status(200).json({ message: "Password updated successfully" });
});

exports.updateNotificationPreferences = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  const preferences = getNotificationPreferences(user);

  Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).forEach((key) => {
    if (typeof req.body[key] === "boolean") {
      preferences[key] = req.body[key];
    }
  });

  user.notification_preferences = preferences;
  await user.save();

  return res.status(200).json({
    message: "Notification preferences updated successfully",
    ...(await getAccountResponse(user)),
  });
});

exports.updateSecurityPreferences = asyncHandler(async (req, res) => {
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return;
  }

  if (typeof req.body.two_factor_enabled === "boolean") {
    user.two_factor_enabled = req.body.two_factor_enabled;
  }

  if (typeof req.body.login_alerts_enabled === "boolean") {
    user.login_alerts_enabled = req.body.login_alerts_enabled;
  }

  await user.save();

  return res.status(200).json({
    message: "Security preferences updated successfully",
    ...(await getAccountResponse(user)),
  });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select("+password");

  if (!user || user.is_deleted) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const password = getString(req.body.password);

  if (!password) {
    return res.status(400).json({ message: "Password confirmation is required" });
  }

  const matches = await bcrypt.compare(password, user.password);

  if (!matches) {
    return res.status(400).json({ message: "Password confirmation is incorrect" });
  }

  const activeSwapCount = await SwapRequest.countDocuments({
    status: { $in: ACTIVE_SWAP_STATUSES },
    $or: [{ requester: user._id }, { receiver: user._id }],
  });

  if (activeSwapCount > 0) {
    return res.status(400).json({
      message: "You cannot delete your account while you have active swaps.",
    });
  }

  const ownedProductIds = await Product.find({ owner_id: user._id }).distinct("_id");

  if (ownedProductIds.length > 0) {
    await User.updateMany(
      { saved_products: { $in: ownedProductIds } },
      { $pull: { saved_products: { $in: ownedProductIds } } }
    );
  }

  await Product.deleteMany({ owner_id: user._id });

  removeLocalAvatar(user.avatar);

  const salt = await bcrypt.genSalt(10);
  user.first_name = "Deleted";
  user.last_name = "user";
  user.email = `deleted-${user._id}@deleted.swapandsave.local`;
  user.password = await bcrypt.hash(new mongoose.Types.ObjectId().toString(), salt);
  user.avatar = "";
  user.phone = "";
  user.bio = "";
  user.country = "";
  user.city = "";
  user.area = "";
  user.street_address = "";
  user.address = "";
  user.isEmailVerified = false;
  user.isPhoneVerified = false;
  clearPhoneVerificationMetadata(user);
  user.saved_products = [];
  user.two_factor_enabled = false;
  user.login_alerts_enabled = false;
  user.notification_preferences = {
    swap_requests_enabled: false,
    new_messages_enabled: false,
    admin_decisions_enabled: false,
    new_ratings_enabled: false,
    promotions_enabled: false,
    weekly_digest_enabled: false,
  };
  user.is_deleted = true;
  user.deleted_at = new Date();
  await user.save();

  return res.status(200).json({ message: "Account deleted successfully" });
});

exports.getPublicProfile = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "User not found" });
  }

  const user = await User.findById(req.params.id);

  if (!user || user.role === "admin" || user.is_deleted) {
    return res.status(404).json({ message: "User not found" });
  }

  const [products, ratings, metrics, currentViewer] = await Promise.all([
    Product.find({ owner_id: user._id, status: { $in: ["available", "active"] } }).sort({ createdAt: -1 }),
    Rating.find({ rated_user: user._id })
      .populate("rater", "_id first_name last_name avatar is_deleted")
      .sort({ createdAt: -1 }),
    getUserMetrics(user),
    req.userId ? User.findById(req.userId).select("saved_products") : null,
  ]);
  const savedProductIds = new Set(
    (currentViewer?.saved_products || []).map((productId) => String(productId))
  );
  const viewerId = String(req.userId || "");

  return res.json({
    user: serializePublicUser(user, metrics),
    products: products.map((product) => ({
      ...product.toObject(),
      is_saved:
        String(product.owner_id) !== viewerId &&
        savedProductIds.has(String(product._id)),
    })),
    ratings: ratings.map(serializeRating),
  });
});
