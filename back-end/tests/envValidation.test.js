const {
  validateProductionEnv,
  validateStartupEnv,
} = require("../src/config/envValidation");
const { getPaymobReturnUrls } = require("../src/services/paymob.service");

const buildProductionEnv = (overrides = {}) => ({
  NODE_ENV: "production",
  MONGO_URI: "mongodb://localhost:27017/swap_save",
  JWT_SECRET: "test_jwt_secret",
  FRONTEND_URL: "https://app.example.com",
  ADMIN_EMAIL: "ops@example.com",
  ADMIN_PASSWORD: "CorrectHorseBattery99!",
  PAYMOB_API_KEY: "paymob_api_key",
  PAYMOB_INTEGRATION_ID: "123456",
  PAYMOB_IFRAME_ID: "654321",
  PAYMOB_HMAC_SECRET: "paymob_hmac_secret",
  PAYMOB_WEBHOOK_URL: "https://api.example.com/payments/paymob/webhook",
  PAYMOB_SUCCESS_URL: "https://app.example.com/user/coins/payment/success",
  PAYMOB_FAILURE_URL: "https://app.example.com/user/coins/payment/failure",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "mailer@example.com",
  SMTP_PASS: "smtp_password",
  SMTP_FROM: "Swap & Save <no-reply@example.com>",
  ...overrides,
});

const restoreProcessEnv = (originalEnv) => {
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
};

describe("startup environment validation", () => {
  test("production missing critical env fails validation without secret values", () => {
    const env = buildProductionEnv({
      MONGO_URI: "",
      JWT_SECRET: "",
      ADMIN_PASSWORD: "",
      PAYMOB_API_KEY: "",
      SMTP_PASS: "",
    });

    expect(() => validateStartupEnv({ env, onWarning: jest.fn() })).toThrow(/Production environment validation failed/);

    try {
      validateStartupEnv({ env, onWarning: jest.fn() });
    } catch (error) {
      expect(error.message).toContain("MONGO_URI");
      expect(error.message).toContain("JWT_SECRET");
      expect(error.message).toContain("ADMIN_PASSWORD");
      expect(error.message).toContain("PAYMOB_API_KEY");
      expect(error.message).toContain("SMTP_PASS");
      expect(error.message).not.toContain("paymob_api_key");
      expect(error.message).not.toContain("smtp_password");
    }
  });

  test("production with safe required env passes core validation", () => {
    const result = validateStartupEnv({
      env: buildProductionEnv(),
      onWarning: jest.fn(),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("development and test do not require production envs", () => {
    expect(validateStartupEnv({ env: { NODE_ENV: "development" }, onWarning: jest.fn() })).toEqual({
      errors: [],
      warnings: [],
    });
    expect(validateStartupEnv({ env: { NODE_ENV: "test" }, onWarning: jest.fn() })).toEqual({
      errors: [],
      warnings: [],
    });
  });

  test("production warns for partially configured optional integrations", () => {
    const warnings = [];
    const result = validateStartupEnv({
      env: buildProductionEnv({
        GOOGLE_CLIENT_ID: "google-client",
        TWILIO_ACCOUNT_SID: "twilio-account",
      }),
      onWarning: (warning) => warnings.push(warning),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(2);
    expect(warnings.join("\n")).toContain("Google OAuth is partially configured");
    expect(warnings.join("\n")).toContain("Twilio Verify is partially configured");
  });

  test("production rejects invalid numeric and URL env values", () => {
    const result = validateProductionEnv(buildProductionEnv({
      FRONTEND_URL: "app.example.com",
      PAYMOB_INTEGRATION_ID: "abc",
      PAYMOB_IFRAME_ID: "0",
      SMTP_PORT: "smtp",
    }));

    expect(result.errors).toEqual(expect.arrayContaining([
      "SMTP_PORT must be a positive integer.",
      "PAYMOB_INTEGRATION_ID must be a positive integer.",
      "PAYMOB_IFRAME_ID must be a positive integer.",
      "FRONTEND_URL must be an absolute http(s) URL.",
    ]));
  });

  test("production rejects localhost frontend and Paymob return URLs", () => {
    const result = validateProductionEnv(buildProductionEnv({
      CLIENT_URL: "http://localhost:3000",
      FRONTEND_URL: "https://swap-save-iota.vercel.app",
      PAYMOB_SUCCESS_URL: "http://127.0.0.1:3000/user/coins/payment/success",
      PAYMOB_FAILURE_URL: "http://localhost:3000/user/coins/payment/failure",
      PAYMOB_WEBHOOK_URL: "http://localhost:5000/payments/paymob/webhook",
    }));

    expect(result.errors).toEqual(expect.arrayContaining([
      "CLIENT_URL must not use localhost or 127.0.0.1 in production.",
      "PAYMOB_SUCCESS_URL must not use localhost or 127.0.0.1 in production.",
      "PAYMOB_FAILURE_URL must not use localhost or 127.0.0.1 in production.",
      "PAYMOB_WEBHOOK_URL must not use localhost or 127.0.0.1 in production.",
    ]));
  });

  test("Paymob return URL helper uses Vercel URLs in production", () => {
    const originalEnv = { ...process.env };

    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://swap-save-iota.vercel.app";
    process.env.CLIENT_URL = "https://swap-save-iota.vercel.app";
    process.env.PAYMOB_SUCCESS_URL = "https://swap-save-iota.vercel.app/user/coins/payment/success";
    process.env.PAYMOB_FAILURE_URL = "https://swap-save-iota.vercel.app/user/coins/payment/failure";

    try {
      expect(getPaymobReturnUrls()).toEqual({
        successUrl: "https://swap-save-iota.vercel.app/user/coins/payment/success",
        failureUrl: "https://swap-save-iota.vercel.app/user/coins/payment/failure",
      });
    } finally {
      restoreProcessEnv(originalEnv);
    }
  });

  test("Paymob return URL helper keeps localhost available outside production", () => {
    const originalEnv = { ...process.env };

    process.env.NODE_ENV = "development";
    delete process.env.FRONTEND_URL;
    delete process.env.CLIENT_URL;
    delete process.env.PAYMOB_SUCCESS_URL;
    delete process.env.PAYMOB_FAILURE_URL;

    try {
      expect(getPaymobReturnUrls()).toEqual({
        successUrl: "http://localhost:3000/user/coins/payment/success",
        failureUrl: "http://localhost:3000/user/coins/payment/failure",
      });
    } finally {
      restoreProcessEnv(originalEnv);
    }
  });
});
