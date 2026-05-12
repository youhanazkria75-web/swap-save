process.env.JWT_SECRET = "test_jwt_secret";

jest.mock("../src/config/twilio", () => ({
  checkPhoneVerificationCode: jest.fn(),
  isTwilioConfigurationError: jest.fn(() => false),
  sendPhoneVerificationCode: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const twilioVerify = require("../src/config/twilio");
const Transaction = require("../src/models/Transaction");
const User = require("../src/models/User");

let mongoServer;

const todayKey = () => new Date().toISOString().slice(0, 10);

const createAuthedUser = async (overrides = {}) => {
  const user = await User.create({
    first_name: "Phone",
    last_name: "User",
    email: `phone-${new mongoose.Types.ObjectId()}@test.com`,
    password: "hashed",
    isEmailVerified: true,
    coins: 0,
    held_coins: 0,
    total_coins_earned: 0,
    total_coins_spent: 0,
    ...overrides,
  });
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

  return { token, user };
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await Promise.all([
    Transaction.deleteMany({}),
    User.deleteMany({}),
  ]);

  twilioVerify.sendPhoneVerificationCode.mockResolvedValue({ sid: "VEtest" });
  twilioVerify.checkPhoneVerificationCode.mockResolvedValue({
    status: "approved",
    valid: true,
  });
  twilioVerify.isTwilioConfigurationError.mockReturnValue(false);
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe("Phone verification API", () => {
  test("sends a Twilio Verify SMS without returning an OTP", async () => {
    const { token, user } = await createAuthedUser({ phone: "01001234567" });

    const res = await request(app)
      .post("/users/me/phone/send-code")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ message: "Verification code sent." });
    expect(res.body.code).toBeUndefined();
    expect(res.body.otp).toBeUndefined();
    expect(twilioVerify.sendPhoneVerificationCode).toHaveBeenCalledWith("+201001234567");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.phone).toBe("+201001234567");
    expect(updatedUser.phone_verification_send_count).toBe(1);
    expect(updatedUser.phone_verification_send_count_date).toBe(todayKey());
    expect(updatedUser.phone_verification_last_sent_at).toBeInstanceOf(Date);
  });

  test("enforces the 60 second send cooldown", async () => {
    const { token } = await createAuthedUser({
      phone: "+201001234567",
      phone_verification_last_sent_at: new Date(),
      phone_verification_send_count: 1,
      phone_verification_send_count_date: todayKey(),
    });

    const res = await request(app)
      .post("/users/me/phone/send-code")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(429);
    expect(res.body.message).toBe("Please wait before requesting another verification code.");
    expect(twilioVerify.sendPhoneVerificationCode).not.toHaveBeenCalled();
  });

  test("enforces the five per day send limit", async () => {
    const { token } = await createAuthedUser({
      phone: "+201001234567",
      phone_verification_last_sent_at: new Date(Date.now() - 61 * 1000),
      phone_verification_send_count: 5,
      phone_verification_send_count_date: todayKey(),
    });

    const res = await request(app)
      .post("/users/me/phone/send-code")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(429);
    expect(res.body.message).toBe("Daily verification code limit reached. Please try again tomorrow.");
    expect(twilioVerify.sendPhoneVerificationCode).not.toHaveBeenCalled();
  });

  test("verifies an approved Twilio code, grants coins once, and records a transaction", async () => {
    const { token, user } = await createAuthedUser({
      phone: "01001234567",
      phone_verification_last_sent_at: new Date(Date.now() - 61 * 1000),
      phone_verification_send_count: 2,
      phone_verification_send_count_date: todayKey(),
    });

    const res = await request(app)
      .post("/users/me/phone/verify-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "123456" });

    expect(res.statusCode).toBe(200);
    expect(twilioVerify.checkPhoneVerificationCode).toHaveBeenCalledWith({
      to: "+201001234567",
      code: "123456",
    });
    expect(res.body.user.isPhoneVerified).toBe(true);
    expect(res.body.wallet.coins).toBe(10);
    expect(res.body.reward_granted).toBe(true);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.isPhoneVerified).toBe(true);
    expect(updatedUser.phone_verification_reward_granted).toBe(true);
    expect(updatedUser.phone_verification_last_sent_at).toBeNull();
    expect(updatedUser.phone_verification_send_count).toBe(0);
    expect(updatedUser.coins).toBe(10);

    const transactions = await Transaction.find({
      user: user._id,
      type: "phone_verification_reward",
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(10);
  });

  test("rejects an invalid Twilio verification code", async () => {
    twilioVerify.checkPhoneVerificationCode.mockResolvedValueOnce({
      status: "pending",
      valid: false,
    });
    const { token, user } = await createAuthedUser({ phone: "+201001234567" });

    const res = await request(app)
      .post("/users/me/phone/verify-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: "000000" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid or expired verification code.");

    const updatedUser = await User.findById(user._id);
    const rewardTransactions = await Transaction.find({
      user: user._id,
      type: "phone_verification_reward",
    });

    expect(updatedUser.isPhoneVerified).toBe(false);
    expect(updatedUser.coins).toBe(0);
    expect(rewardTransactions).toHaveLength(0);
  });
});
