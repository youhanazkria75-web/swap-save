process.env.JWT_SECRET = "test_jwt_secret";

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

jest.mock("../src/config/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const bootstrapAdmin = require("../src/config/bootstrapAdmin");
const User = require("../src/models/User");

const TRACKED_ENV_KEYS = [
  "NODE_ENV",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_FIRST_NAME",
  "ADMIN_LAST_NAME",
];

let mongoServer;
const originalEnv = {};

const restoreTrackedEnv = () => {
  TRACKED_ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  });
};

beforeAll(async () => {
  TRACKED_ENV_KEYS.forEach((key) => {
    originalEnv[key] = process.env[key];
  });

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterEach(async () => {
  restoreTrackedEnv();
  jest.clearAllMocks();
  await User.deleteMany({});
});

afterAll(async () => {
  restoreTrackedEnv();
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("bootstrap admin configuration", () => {
  test("keeps development bootstrap defaults outside production", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    await bootstrapAdmin();

    const admin = await User.findOne({ role: "admin" }).select("+password");

    expect(admin).toBeTruthy();
    expect(admin.email).toBe("admin@swap-save.com");
    expect(await bcrypt.compare("admin123", admin.password)).toBe(true);
  });

  test("production rejects missing bootstrap admin email", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = "CorrectHorseBattery99!";

    await expect(bootstrapAdmin()).rejects.toThrow(/requires ADMIN_EMAIL/);

    expect(await User.countDocuments({ role: "admin" })).toBe(0);
  });

  test("production rejects missing bootstrap admin password", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAIL = "ops@example.com";
    delete process.env.ADMIN_PASSWORD;

    await expect(bootstrapAdmin()).rejects.toThrow(/requires ADMIN_PASSWORD/);

    expect(await User.countDocuments({ role: "admin" })).toBe(0);
  });

  test("production rejects default bootstrap admin email", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAIL = "admin@swap-save.com";
    process.env.ADMIN_PASSWORD = "CorrectHorseBattery99!";

    await expect(bootstrapAdmin()).rejects.toThrow(/must not use the default value/);

    expect(await User.countDocuments({ role: "admin" })).toBe(0);
  });

  test.each([
    "admin123",
    "password",
    "123456789012",
    "swap-save",
    "change_me_to_a_strong_unique_password",
    "short",
  ])("production rejects weak bootstrap admin password %s", async (adminPassword) => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAIL = "ops@example.com";
    process.env.ADMIN_PASSWORD = adminPassword;

    await expect(bootstrapAdmin()).rejects.toThrow(/ADMIN_PASSWORD/);

    expect(await User.countDocuments({ role: "admin" })).toBe(0);
  });

  test("production creates a bootstrap admin with strong credentials idempotently", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAIL = "ops@example.com";
    process.env.ADMIN_PASSWORD = "CorrectHorseBattery99!";
    process.env.ADMIN_FIRST_NAME = "Ops";
    process.env.ADMIN_LAST_NAME = "Admin";

    await bootstrapAdmin();

    const admin = await User.findOne({ role: "admin" }).select("+password");
    const initialPasswordHash = admin.password;

    expect(admin.email).toBe("ops@example.com");
    expect(admin.first_name).toBe("Ops");
    expect(admin.last_name).toBe("Admin");
    expect(await bcrypt.compare("CorrectHorseBattery99!", admin.password)).toBe(true);

    process.env.ADMIN_PASSWORD = "AnotherStrongSecret99!";
    await bootstrapAdmin();

    const admins = await User.find({ role: "admin" }).select("+password");

    expect(admins).toHaveLength(1);
    expect(admins[0].password).toBe(initialPasswordHash);
  });
});
