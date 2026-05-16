const { getUnsafeProductionUrlReason } = require("../utils/urlSafety");

const PRODUCTION_REQUIRED_ENV = [
  "NODE_ENV",
  "MONGO_URI",
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
];

const PRODUCTION_URL_ENV = [
  "FRONTEND_URL",
  "CLIENT_URL",
  "PAYMOB_WEBHOOK_URL",
  "PAYMOB_SUCCESS_URL",
  "PAYMOB_FAILURE_URL",
];

const PAYMOB_PRODUCTION_ENV = [
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_IFRAME_ID",
  "PAYMOB_HMAC_SECRET",
  "PAYMOB_WEBHOOK_URL",
  "PAYMOB_SUCCESS_URL",
  "PAYMOB_FAILURE_URL",
];

const SMTP_PRODUCTION_ENV = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const GOOGLE_OAUTH_ENV = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
];

const TWILIO_VERIFY_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
];

const getEnvValue = (env, key) =>
  typeof env[key] === "string" ? env[key].trim() : "";

const getMissingEnv = (env, keys) =>
  keys.filter((key) => !getEnvValue(env, key));

const hasAnyEnv = (env, keys) =>
  keys.some((key) => Boolean(getEnvValue(env, key)));

const isPositiveIntegerEnv = (env, key) => {
  const value = getEnvValue(env, key);
  return /^\d+$/.test(value) && Number(value) > 0;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
};

const addProductionUrlSafetyErrors = (errors, key, value) => {
  try {
    const reason = getUnsafeProductionUrlReason(value);

    if (reason) {
      errors.push(`${key} ${reason}`);
    }
  } catch (_error) {
    // URL shape is validated separately so callers get one clear URL error.
  }
};

const addMissingEnvError = (errors, label, missing) => {
  if (missing.length > 0) {
    errors.push(`${label} missing: ${missing.join(", ")}`);
  }
};

const addPartialOptionalWarning = (warnings, env, label, keys) => {
  if (!hasAnyEnv(env, keys)) return;

  const missing = getMissingEnv(env, keys);

  if (missing.length > 0) {
    warnings.push(
      `${label} is partially configured. Missing: ${missing.join(", ")}. This optional feature will not work until all values are set.`
    );
  }
};

const validateProductionEnv = (env = process.env) => {
  const errors = [];
  const warnings = [];

  addMissingEnvError(errors, "Required production env", getMissingEnv(env, PRODUCTION_REQUIRED_ENV));

  if (!getEnvValue(env, "FRONTEND_URL") && !getEnvValue(env, "CLIENT_URL")) {
    errors.push("Production startup requires FRONTEND_URL or CLIENT_URL.");
  }

  addMissingEnvError(errors, "Paymob production env", getMissingEnv(env, PAYMOB_PRODUCTION_ENV));
  addMissingEnvError(errors, "SMTP production env", getMissingEnv(env, SMTP_PRODUCTION_ENV));

  if (getEnvValue(env, "SMTP_PORT") && !isPositiveIntegerEnv(env, "SMTP_PORT")) {
    errors.push("SMTP_PORT must be a positive integer.");
  }

  if (getEnvValue(env, "PAYMOB_INTEGRATION_ID") && !isPositiveIntegerEnv(env, "PAYMOB_INTEGRATION_ID")) {
    errors.push("PAYMOB_INTEGRATION_ID must be a positive integer.");
  }

  if (getEnvValue(env, "PAYMOB_IFRAME_ID") && !isPositiveIntegerEnv(env, "PAYMOB_IFRAME_ID")) {
    errors.push("PAYMOB_IFRAME_ID must be a positive integer.");
  }

  PRODUCTION_URL_ENV.forEach((key) => {
    const value = getEnvValue(env, key);
    if (value && !isHttpUrl(value)) {
      errors.push(`${key} must be an absolute http(s) URL.`);
      return;
    }

    if (value) {
      addProductionUrlSafetyErrors(errors, key, value);
    }
  });

  if (hasAnyEnv(env, GOOGLE_OAUTH_ENV)) {
    addMissingEnvError(errors, "Google OAuth production env", getMissingEnv(env, GOOGLE_OAUTH_ENV));

    const googleCallbackUrl = getEnvValue(env, "GOOGLE_CALLBACK_URL");
    if (googleCallbackUrl && !isHttpUrl(googleCallbackUrl)) {
      errors.push("GOOGLE_CALLBACK_URL must be an absolute http(s) URL.");
    } else if (googleCallbackUrl) {
      addProductionUrlSafetyErrors(errors, "GOOGLE_CALLBACK_URL", googleCallbackUrl);
    }
  }

  addPartialOptionalWarning(warnings, env, "Twilio Verify", TWILIO_VERIFY_ENV);

  return { errors, warnings };
};

const validateStartupEnv = ({ env = process.env, onWarning = console.warn } = {}) => {
  if (env.NODE_ENV !== "production") {
    return { errors: [], warnings: [] };
  }

  const result = validateProductionEnv(env);

  result.warnings.forEach((warning) => onWarning(`[env] ${warning}`));

  if (result.errors.length > 0) {
    throw new Error(
      [
        "Production environment validation failed.",
        ...result.errors.map((error) => `- ${error}`),
      ].join("\n")
    );
  }

  return result;
};

module.exports = {
  GOOGLE_OAUTH_ENV,
  PAYMOB_PRODUCTION_ENV,
  PRODUCTION_REQUIRED_ENV,
  SMTP_PRODUCTION_ENV,
  TWILIO_VERIFY_ENV,
  validateProductionEnv,
  validateStartupEnv,
};
