const PHONE_VERIFICATION_COOLDOWN_MS = 60 * 1000;
const PHONE_VERIFICATION_DAILY_SEND_LIMIT = 5;

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const getPhoneVerificationDateKey = (date = new Date()) =>
  date.toISOString().slice(0, 10);

const normalizePhoneNumberForVerification = (phone) => {
  const raw = typeof phone === "string" ? phone.trim() : "";

  if (!raw) {
    throw createValidationError("Phone number is required.");
  }

  let value = raw.replace(/[().\s-]/g, "");

  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (value.startsWith("+")) {
    if (/^\+201[0125]\d{8}$/.test(value)) {
      return value;
    }

    if (/^\+[1-9]\d{7,14}$/.test(value)) {
      return value;
    }

    throw createValidationError("Enter a valid phone number in international format.");
  }

  const digits = value.replace(/\D/g, "");

  if (/^01[0125]\d{8}$/.test(digits)) {
    return `+2${digits}`;
  }

  if (/^1[0125]\d{8}$/.test(digits)) {
    return `+20${digits}`;
  }

  if (/^201[0125]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }

  throw createValidationError("Enter a valid Egyptian mobile phone number.");
};

const clearPhoneVerificationMetadata = (user) => {
  user.phone_verification_last_sent_at = null;
  user.phone_verification_send_count = 0;
  user.phone_verification_send_count_date = "";
};

const resetPhoneVerificationState = (user) => {
  user.isPhoneVerified = false;
  clearPhoneVerificationMetadata(user);
};

module.exports = {
  PHONE_VERIFICATION_COOLDOWN_MS,
  PHONE_VERIFICATION_DAILY_SEND_LIMIT,
  clearPhoneVerificationMetadata,
  getPhoneVerificationDateKey,
  normalizePhoneNumberForVerification,
  resetPhoneVerificationState,
};
