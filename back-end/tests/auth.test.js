process.env.JWT_SECRET = "test_jwt_secret";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const User = require("../src/models/User");
const BlockedAccount = require("../src/models/BlockedAccount");
const { BLOCKED_ACCOUNT_MESSAGE, hashBlockedEmail } = require("../src/utils/blockedAccounts");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("Auth API", () => {
  test("Register new user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Test",
        last_name: "User",
        email: "test@test.com",
        password: "Password1!",
        country: "Egypt",
        city: "Cairo",
        area: "Nasr City",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeUndefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.isEmailVerified).toBe(false);
  });

  test("Register handles verification email send failure without removing the unverified account", async () => {
    const smtpEnvKeys = [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_SECURE",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
      "SMTP_TIMEOUT_MS",
      "SMTP_CONNECTION_TIMEOUT_MS",
    ];
    const originalEnv = Object.fromEntries(smtpEnvKeys.map((key) => [key, process.env[key]]));
    const timeoutError = new Error("Connection timeout");
    timeoutError.code = "ETIMEDOUT";
    const createTransportSpy = jest.spyOn(nodemailer, "createTransport").mockReturnValue({
      verify: jest.fn().mockRejectedValue(timeoutError),
      sendMail: jest.fn(),
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "mailer@example.com";
    process.env.SMTP_PASS = "app-password";
    process.env.SMTP_FROM = "Swap & Save <mailer@example.com>";
    delete process.env.SMTP_TIMEOUT_MS;
    delete process.env.SMTP_CONNECTION_TIMEOUT_MS;

    try {
      const res = await request(app)
        .post("/auth/register")
        .send({
          first_name: "Email",
          last_name: "Failure",
          email: "email-failure@test.com",
          password: "Password1!",
          country: "Egypt",
          city: "Cairo",
          area: "Nasr City",
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.verification_email_sent).toBe(false);
      expect(res.body.message).toBe("Registered successfully, but we could not send the verification email right now.");
      expect(createTransportSpy).toHaveBeenCalledWith(expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        family: 4,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
      }));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("email connection timeout"));

      const user = await User.findOne({ email: "email-failure@test.com" })
        .select("+emailVerificationToken +emailVerificationExpires");

      expect(user).toBeDefined();
      expect(user.isEmailVerified).toBe(false);
      expect(user.emailVerificationToken).toBeTruthy();
      expect(user.emailVerificationExpires).toBeInstanceOf(Date);
    } finally {
      createTransportSpy.mockRestore();
      warnSpy.mockRestore();
      for (const key of smtpEnvKeys) {
        if (originalEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      }
    }
  });

  test("Register maps location fields directly", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Location",
        last_name: "User",
        email: "location@test.com",
        password: "Password1!",
        country: "Egypt",
        city: "Cairo",
        area: "Nasr City",
        street_address: "15 Abbas El Akkad",
        address: "Alexandria",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.user.country).toBe("Egypt");
    expect(res.body.user.city).toBe("Cairo");
    expect(res.body.user.area).toBe("Nasr City");
    expect(res.body.user.street_address).toBe("15 Abbas El Akkad");

    const user = await User.findOne({ email: "location@test.com" });
    expect(user.country).toBe("Egypt");
    expect(user.city).toBe("Cairo");
    expect(user.area).toBe("Nasr City");
    expect(user.street_address).toBe("15 Abbas El Akkad");
    expect(user.address).toBe("15 Abbas El Akkad");
  });

  test("Register rejects non-Egypt country", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Invalid",
        last_name: "Country",
        email: "invalid-country@test.com",
        password: "Password1!",
        country: "France",
        city: "Cairo",
        area: "Nasr City",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/country/i);
  });

  test("Register rejects unsupported Egypt city", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Invalid",
        last_name: "City",
        email: "invalid-city@test.com",
        password: "Password1!",
        country: "Egypt",
        city: "Atlantis",
        area: "Nasr City",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/city/i);
  });

  test("Register rejects missing area", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Missing",
        last_name: "Area",
        email: "missing-area@test.com",
        password: "Password1!",
        country: "Egypt",
        city: "Cairo",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/area/i);
  });

  test("Register rejects area outside selected city", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Wrong",
        last_name: "Area",
        email: "wrong-area@test.com",
        password: "Password1!",
        country: "Egypt",
        city: "Cairo",
        area: "Dokki",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/area/i);
  });

  test("Account settings do not expose legacy address as street address", async () => {
    const user = await User.create({
      first_name: "Google",
      last_name: "User",
      email: "google@test.com",
      password: "unused",
      country: "",
      city: "",
      area: "",
      street_address: "",
      address: "Cairo",
      isEmailVerified: true,
    });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.country).toBe("");
    expect(res.body.user.city).toBe("");
    expect(res.body.user.area).toBe("");
    expect(res.body.user.street_address).toBe("");
    expect(res.body.user.address).toBe("");
  });

  test("Account metrics calculate profile completeness from reward fields", async () => {
    const user = await User.create({
      first_name: "Reward",
      last_name: "Fields",
      email: "reward-fields@test.com",
      password: "unused",
      phone: "+201001234567",
      bio: "Swap enthusiast",
      country: "Egypt",
      city: "Cairo",
      area: "Not required for reward",
      street_address: "15 Abbas El Akkad",
      avatar: "",
      isEmailVerified: true,
    });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.profile_completeness).toBe(88);
  });

  test("Reject login before email verification", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "test@test.com",
        password: "Password1!",
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Please verify your email before logging in.");
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.body.can_resend_verification).toBe(true);
    expect(res.body.token).toBeUndefined();
  });

  test("Protected route rejects an unverified user token", async () => {
    const user = await User.create({
      first_name: "Protected",
      last_name: "Unverified",
      email: `protected-unverified-${Date.now()}@test.com`,
      password: "unused",
      isEmailVerified: false,
    });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

    const res = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Please verify your email before continuing.");
  });

  test("Resend verification response does not reveal account existence", async () => {
    const missingRes = await request(app)
      .post("/auth/resend-verification-email")
      .send({ email: "missing@example.com" });

    const existingRes = await request(app)
      .post("/auth/resend-verification-email")
      .send({ email: "test@test.com" });

    expect(missingRes.statusCode).toBe(200);
    expect(existingRes.statusCode).toBe(200);
    expect(missingRes.body.message).toBe(existingRes.body.message);
  });

  test("Resend verification email refreshes token for an existing unverified user without verifying them", async () => {
    const email = "resend-unverified@test.com";
    const oldTokenHash = crypto.createHash("sha256").update("old-token").digest("hex");

    await User.create({
      first_name: "Resend",
      last_name: "Unverified",
      email,
      password: "unused",
      isEmailVerified: false,
      emailVerificationToken: oldTokenHash,
      emailVerificationExpires: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .post("/auth/resend-verification-email")
      .send({ email });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("If an account exists and still needs verification, a verification email has been sent.");

    const user = await User.findOne({ email }).select("+emailVerificationToken +emailVerificationExpires");

    expect(user.isEmailVerified).toBe(false);
    expect(user.emailVerificationToken).toBeTruthy();
    expect(user.emailVerificationToken).not.toBe(oldTokenHash);
    expect(user.emailVerificationExpires).toBeInstanceOf(Date);
  });

  test("Duplicate unverified email does not create another user and guides resend verification", async () => {
    const email = "duplicate-unverified@test.com";

    await User.create({
      first_name: "Duplicate",
      last_name: "Unverified",
      email,
      password: "unused",
      isEmailVerified: false,
    });

    const res = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Duplicate",
        last_name: "Attempt",
        email,
        password: "Password1!",
        country: "Egypt",
        city: "Cairo",
        area: "Nasr City",
      });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(res.body.can_resend_verification).toBe(true);
    expect(await User.countDocuments({ email })).toBe(1);
  });

  test("Login verified user", async () => {
    await User.updateOne({ email: "test@test.com" }, { isEmailVerified: true });

    const res = await request(app)
      .post("/auth/login")
      .send({
        email: "test@test.com",
        password: "Password1!",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordResetToken).toBeUndefined();
    expect(res.body.user.emailVerificationToken).toBeUndefined();
  });

  test("Blocked account email cannot register, login, or continue through Google OAuth", async () => {
    const blockedEmail = "blocked-google@test.com";
    const blocker = await User.create({
      first_name: "Blocking",
      last_name: "Admin",
      email: "blocking-admin@test.com",
      password: "unused",
      role: "admin",
      isEmailVerified: true,
    });

    await BlockedAccount.create({
      email_hash: hashBlockedEmail(blockedEmail),
      reason: "Platform removal",
      blocked_by: blocker._id,
      blocked_at: new Date(),
    });

    const register = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Blocked",
        last_name: "User",
        email: blockedEmail,
        password: "Password1!",
      });

    expect(register.statusCode).toBe(403);
    expect(register.body.message).toBe(BLOCKED_ACCOUNT_MESSAGE);

    const login = await request(app)
      .post("/auth/login")
      .send({
        email: blockedEmail.toUpperCase(),
        password: "Password1!",
      });

    expect(login.statusCode).toBe(403);
    expect(login.body.message).toBe(BLOCKED_ACCOUNT_MESSAGE);

    const originalFetch = global.fetch;
    const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const state = jwt.sign(
      {
        provider: "google",
        source: "login",
        nonce: "blocked-test",
      },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "google-access-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          email: blockedEmail,
          email_verified: true,
          name: "Blocked Google",
        }),
      });

    try {
      const google = await request(app)
        .get(`/auth/google/callback?code=test-code&state=${encodeURIComponent(state)}`);

      expect(google.statusCode).toBe(302);
      expect(new URL(google.headers.location).searchParams.get("error")).toBe(BLOCKED_ACCOUNT_MESSAGE);
      expect(await User.findOne({ email: blockedEmail })).toBeNull();
    } finally {
      global.fetch = originalFetch;
      if (originalGoogleClientId === undefined) {
        delete process.env.GOOGLE_CLIENT_ID;
      } else {
        process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
      }
      if (originalGoogleClientSecret === undefined) {
        delete process.env.GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
      }
    }
  });

  test("Reset password token can be used only once", async () => {
    const resetToken = "single-use-reset-token";
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    await User.updateOne(
      { email: "test@test.com" },
      {
        passwordResetToken: tokenHash,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
      }
    );

    const firstReset = await request(app)
      .post("/auth/reset-password")
      .send({
        token: resetToken,
        password: "NewPassword1!",
      });

    expect(firstReset.statusCode).toBe(200);
    expect(firstReset.body.message).toBe("Password reset successful");

    const secondReset = await request(app)
      .post("/auth/reset-password")
      .send({
        token: resetToken,
        password: "AnotherPassword1!",
      });

    expect(secondReset.statusCode).toBe(400);
    expect(secondReset.body.message).toBe("Invalid or expired reset link");

    const login = await request(app)
      .post("/auth/login")
      .send({
        email: "test@test.com",
        password: "NewPassword1!",
      });

    expect(login.statusCode).toBe(200);
    expect(login.body.token).toBeDefined();
  });
});
