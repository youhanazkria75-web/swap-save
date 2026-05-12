const crypto = require("crypto");
const BlockedAccount = require("../models/BlockedAccount");

const BLOCKED_ACCOUNT_MESSAGE =
  "This account has been blocked from the platform. Please contact support.";

const normalizeEmailForBlock = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const getHashSecret = () =>
  process.env.BLOCKED_ACCOUNT_HASH_SECRET ||
  process.env.JWT_SECRET ||
  "swap-save-blocked-account-hash";

const hashBlockedEmail = (email) => {
  const normalizedEmail = normalizeEmailForBlock(email);

  if (!normalizedEmail) {
    return "";
  }

  return crypto
    .createHmac("sha256", getHashSecret())
    .update(normalizedEmail)
    .digest("hex");
};

const isEmailBlocked = async (email) => {
  const emailHash = hashBlockedEmail(email);

  if (!emailHash) {
    return false;
  }

  return Boolean(await BlockedAccount.exists({ email_hash: emailHash }));
};

const blockEmailForPlatform = async ({ email, reason, blockedBy, blockedAt = new Date() }) => {
  const normalizedEmail = normalizeEmailForBlock(email);
  const emailHash = hashBlockedEmail(normalizedEmail);

  if (!normalizedEmail || !emailHash) {
    const error = new Error("A valid user email is required before removing from platform.");
    error.statusCode = 400;
    throw error;
  }

  return BlockedAccount.findOneAndUpdate(
    { email_hash: emailHash },
    {
      $set: {
        reason,
        blocked_by: blockedBy,
        blocked_at: blockedAt,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      runValidators: true,
    }
  );
};

module.exports = {
  BLOCKED_ACCOUNT_MESSAGE,
  blockEmailForPlatform,
  hashBlockedEmail,
  isEmailBlocked,
  normalizeEmailForBlock,
};
