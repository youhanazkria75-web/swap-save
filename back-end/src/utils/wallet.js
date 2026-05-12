const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { createNotification } = require("./notifications");

const WELCOME_SIGNUP_COINS = 50;
const MONTHLY_FREE_SWAPS_LIMIT = 3;
const FEATURE_PRODUCT_COST = 10;
const EXTRA_SWAP_SLOT_COST = 5;
const PRIORITY_MATCHING_COST = 5;
const SWAP_COMPLETION_REWARD_COINS = 5;
const PHONE_VERIFICATION_REWARD_COINS = 10;
const PROFILE_COMPLETE_REWARD_COINS = 10;
const PROFILE_COMPLETE_REWARD_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "bio",
  "country",
  "city",
  "street_address",
  "avatar",
];

const getId = (value) => {
  if (!value) return value;
  return value._id || value;
};

const getCurrentWalletPeriod = (date = new Date()) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

const hasValue = (value) => typeof value === "string" ? value.trim().length > 0 : Boolean(value);

const isProfileCompleteForReward = (user) =>
  Boolean(user) && PROFILE_COMPLETE_REWARD_FIELDS.every((field) => hasValue(user[field]));

const sanitizeTransactionMetadataForUser = (metadata = {}) => {
  const sanitized = { ...(metadata || {}) };

  if (sanitized.admin && typeof sanitized.admin === "object") {
    sanitized.admin = { ...sanitized.admin };
    delete sanitized.admin.email;
  }

  delete sanitized.admin_id;

  return sanitized;
};

const getPaymobCheckoutUrls = (source = {}) => {
  const metadata = source.metadata || {};
  const paymentUrl = metadata.paymobPaymentUrl || metadata.paymobIframeUrl || "";
  const iframeUrl = metadata.paymobIframeUrl || metadata.paymobPaymentUrl || "";

  return {
    checkoutUrl: paymentUrl,
    paymentUrl,
    iframeUrl,
    canContinue: Boolean(paymentUrl),
  };
};

const serializeTransaction = (transaction) => {
  const source = transaction && typeof transaction.toObject === "function"
    ? transaction.toObject()
    : transaction;

  if (!source) {
    return null;
  }

  const serialized = {
    id: String(source._id),
    _id: source._id,
    user: source.user,
    userId: source.user ? String(source.user._id || source.user) : undefined,
    swap: source.swap || null,
    swapId: source.swap ? String(source.swap._id || source.swap) : undefined,
    product: source.product || null,
    productId: source.product ? String(source.product._id || source.product) : undefined,
    type: source.type,
    direction: source.direction,
    amount: Number(source.amount || 0),
    currency: source.currency || "coins",
    status: source.status,
    description: source.description || "",
    metadata: sanitizeTransactionMetadataForUser(source.metadata),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };

  if (
    source.type === "package_purchase_pending" &&
    source.status === "pending" &&
    source.metadata?.provider === "paymob"
  ) {
    const checkout = getPaymobCheckoutUrls(source);
    serialized.checkout_url = checkout.checkoutUrl;
    serialized.payment_url = checkout.paymentUrl;
    serialized.iframe_url = checkout.iframeUrl;
    serialized.can_continue = checkout.canContinue;
  }

  return serialized;
};

const getWalletNotificationTitle = (transaction) => {
  if (transaction.type === "swap_completion_reward") return "Swap reward granted";
  if (transaction.type === "phone_verification_reward") return "Phone verification reward granted";
  if (transaction.type === "profile_complete_reward") return "Profile reward granted";
  if (transaction.type === "admin_adjustment") return "Wallet adjusted by admin";

  switch (transaction.direction) {
    case "credit":
      return "Coins credited";
    case "debit":
      return "Coins debited";
    case "hold":
      return "Coins held";
    case "release":
      return "Coins released";
    case "refund":
      return "Coins refunded";
    default:
      return "Wallet updated";
  }
};

const createWalletNotification = async (transaction) => {
  if (!transaction || transaction.metadata?.notify === false) {
    return null;
  }

  return createNotification({
    user: transaction.user,
    type: "payment",
    title: getWalletNotificationTitle(transaction),
    body: transaction.description || `${transaction.amount} coins ${transaction.direction}.`,
    target_type: "wallet",
    target_id: transaction._id,
    target_url: "/user/coins",
    bypass_preferences: true,
  }).catch(() => null);
};

const createCoinTransaction = async ({
  user,
  swap = null,
  product = null,
  type,
  direction,
  amount,
  status = "completed",
  description = "",
  metadata = {},
}) => {
  const transaction = await Transaction.create({
    user: getId(user),
    swap: getId(swap) || null,
    product: getId(product) || null,
    type,
    direction,
    amount,
    currency: "coins",
    status,
    description,
    metadata,
  });

  await createWalletNotification(transaction);

  return transaction;
};

const createRewardTransactionOnce = async ({
  user,
  swap = null,
  type,
  amount,
  description,
  metadata = {},
}) => {
  const userId = getId(user);
  const swapId = getId(swap);
  const filter = {
    user: userId,
    type,
  };

  if (swapId) {
    filter.swap = swapId;
  }

  const result = await Transaction.updateOne(
    filter,
    {
      $setOnInsert: {
        user: userId,
        swap: swapId || null,
        product: null,
        type,
        direction: "credit",
        amount,
        currency: "coins",
        status: "completed",
        description,
        metadata,
      },
    },
    { upsert: true }
  );

  const inserted = Number(result.upsertedCount || 0) > 0;

  if (inserted) {
    const transaction = await Transaction.findOne(filter);
    await createWalletNotification(transaction);
  }

  return inserted;
};

const ensureCurrentMonthlySwapPeriod = async (userId) => {
  const period = getCurrentWalletPeriod();
  await User.updateOne(
    {
      _id: userId,
      $or: [
        { monthly_free_swaps_period: { $ne: period } },
        { monthly_free_swaps_period: { $exists: false } },
      ],
    },
    {
      $set: {
        monthly_free_swaps_period: period,
        monthly_free_swaps_used: 0,
      },
    }
  );

  return period;
};

const getWalletUser = async (userId) => {
  await ensureCurrentMonthlySwapPeriod(userId);
  return User.findById(userId);
};

const getWalletSummary = async (userId, { transactionLimit = 50 } = {}) => {
  const user = await getWalletUser(userId);

  if (!user || user.is_deleted) {
    return null;
  }

  const transactions = await Transaction.find({ user: user._id })
    .sort({ createdAt: -1 })
    .limit(transactionLimit);

  const monthlyFreeSwapsUsed = Number(user.monthly_free_swaps_used || 0);

  return {
    coins: Number(user.coins || 0),
    held_coins: Number(user.held_coins || 0),
    total_coins_earned: Number(user.total_coins_earned || 0),
    total_coins_spent: Number(user.total_coins_spent || 0),
    monthly_free_swaps_used: monthlyFreeSwapsUsed,
    monthly_free_swaps_limit: MONTHLY_FREE_SWAPS_LIMIT,
    free_swaps_remaining: Math.max(0, MONTHLY_FREE_SWAPS_LIMIT - monthlyFreeSwapsUsed),
    extra_swap_slots: Number(user.extra_swap_slots || 0),
    priority_matches_available: Number(user.priority_matches_available || 0),
    transactions: transactions.map(serializeTransaction).filter(Boolean),
  };
};

const grantSignupBonus = async (userId, metadata = {}) => {
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      signup_bonus_granted: { $ne: true },
    },
    {
      $inc: {
        coins: WELCOME_SIGNUP_COINS,
        total_coins_earned: WELCOME_SIGNUP_COINS,
      },
      $set: {
        signup_bonus_granted: true,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    return User.findById(userId);
  }

  await createCoinTransaction({
    user: updatedUser._id,
    type: "signup_bonus",
    direction: "credit",
    amount: WELCOME_SIGNUP_COINS,
    description: "Welcome signup bonus",
    metadata,
  });

  return updatedUser;
};

const grantProfileCompleteRewardIfEligible = async (userOrId, metadata = {}) => {
  const user = typeof userOrId === "object" && userOrId !== null
    ? userOrId
    : await User.findById(userOrId);

  if (!isProfileCompleteForReward(user)) {
    return { granted: false, user };
  }

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: getId(user),
      profile_complete_reward_granted: { $ne: true },
    },
    {
      $inc: {
        coins: PROFILE_COMPLETE_REWARD_COINS,
        total_coins_earned: PROFILE_COMPLETE_REWARD_COINS,
      },
      $set: {
        profile_complete_reward_granted: true,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    return { granted: false, user: await User.findById(getId(user)) };
  }

  await createRewardTransactionOnce({
    user: updatedUser._id,
    type: "profile_complete_reward",
    amount: PROFILE_COMPLETE_REWARD_COINS,
    description: "Reward for completing your profile",
    metadata,
  });

  return { granted: true, user: updatedUser };
};

const grantPhoneVerificationRewardIfEligible = async (userOrId, { wasPhoneVerified, metadata = {} } = {}) => {
  const user = typeof userOrId === "object" && userOrId !== null
    ? userOrId
    : await User.findById(userOrId);

  if (!user || wasPhoneVerified !== false || !user.isPhoneVerified) {
    return { granted: false, user };
  }

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: getId(user),
      isPhoneVerified: true,
      phone_verification_reward_granted: { $ne: true },
    },
    {
      $inc: {
        coins: PHONE_VERIFICATION_REWARD_COINS,
        total_coins_earned: PHONE_VERIFICATION_REWARD_COINS,
      },
      $set: {
        phone_verification_reward_granted: true,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    return { granted: false, user: await User.findById(getId(user)) };
  }

  await createRewardTransactionOnce({
    user: updatedUser._id,
    type: "phone_verification_reward",
    amount: PHONE_VERIFICATION_REWARD_COINS,
    description: "Reward for verifying your phone",
    metadata,
  });

  return { granted: true, user: updatedUser };
};

const grantSwapCompletionReward = async (userId, swapId, metadata = {}) => {
  const inserted = await createRewardTransactionOnce({
    user: userId,
    swap: swapId,
    type: "swap_completion_reward",
    amount: SWAP_COMPLETION_REWARD_COINS,
    description: "Reward for completing a swap",
    metadata,
  });

  if (!inserted) {
    return { granted: false };
  }

  await User.updateOne(
    { _id: userId },
    {
      $inc: {
        coins: SWAP_COMPLETION_REWARD_COINS,
        total_coins_earned: SWAP_COMPLETION_REWARD_COINS,
      },
    }
  );

  return { granted: true };
};

const grantSwapCompletionRewards = async (swap, metadata = {}) => {
  const participantIds = [...new Set([swap.requester, swap.receiver].map((participant) => String(getId(participant))))];
  const results = await Promise.all(
    participantIds.map((participantId) =>
      grantSwapCompletionReward(participantId, swap._id, metadata)
    )
  );

  return {
    granted_count: results.filter((result) => result.granted).length,
  };
};

const spendCoins = async ({
  userId,
  amount,
  type,
  description,
  product = null,
  swap = null,
  metadata = {},
  extraIncrement = {},
}) => {
  const increments = {
    coins: -amount,
    total_coins_spent: amount,
    ...extraIncrement,
  };

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: userId,
      coins: { $gte: amount },
    },
    {
      $inc: increments,
    },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    const error = new Error(`Insufficient coins. This action requires ${amount} coins.`);
    error.statusCode = 400;
    throw error;
  }

  const transaction = await createCoinTransaction({
    user: updatedUser._id,
    product,
    swap,
    type,
    direction: "debit",
    amount,
    description,
    metadata,
  });

  return { user: updatedUser, transaction };
};

const consumeSwapRequestSlot = async (userId) => {
  const period = await ensureCurrentMonthlySwapPeriod(userId);

  const freeSlotUser = await User.findOneAndUpdate(
    {
      _id: userId,
      monthly_free_swaps_period: period,
      monthly_free_swaps_used: { $lt: MONTHLY_FREE_SWAPS_LIMIT },
    },
    {
      $inc: { monthly_free_swaps_used: 1 },
    },
    { returnDocument: "after" }
  );

  if (freeSlotUser) {
    return { type: "free", user: freeSlotUser };
  }

  const extraSlotUser = await User.findOneAndUpdate(
    {
      _id: userId,
      monthly_free_swaps_period: period,
      monthly_free_swaps_used: { $gte: MONTHLY_FREE_SWAPS_LIMIT },
      extra_swap_slots: { $gt: 0 },
    },
    {
      $inc: { extra_swap_slots: -1 },
    },
    { returnDocument: "after" }
  );

  if (extraSlotUser) {
    return { type: "extra", user: extraSlotUser };
  }

  const error = new Error(`You have used your free monthly swap requests. Buy an extra swap slot for ${EXTRA_SWAP_SLOT_COST} coins to continue.`);
  error.statusCode = 400;
  throw error;
};

module.exports = {
  WELCOME_SIGNUP_COINS,
  MONTHLY_FREE_SWAPS_LIMIT,
  FEATURE_PRODUCT_COST,
  EXTRA_SWAP_SLOT_COST,
  PRIORITY_MATCHING_COST,
  SWAP_COMPLETION_REWARD_COINS,
  PHONE_VERIFICATION_REWARD_COINS,
  PROFILE_COMPLETE_REWARD_COINS,
  PROFILE_COMPLETE_REWARD_FIELDS,
  createCoinTransaction,
  createWalletNotification,
  consumeSwapRequestSlot,
  ensureCurrentMonthlySwapPeriod,
  getCurrentWalletPeriod,
  getWalletSummary,
  grantPhoneVerificationRewardIfEligible,
  grantProfileCompleteRewardIfEligible,
  grantSignupBonus,
  grantSwapCompletionRewards,
  isProfileCompleteForReward,
  serializeTransaction,
  spendCoins,
};
