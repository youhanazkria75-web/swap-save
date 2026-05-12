const Product = require("../models/Product");
const Rating = require("../models/Rating");
const SwapRequest = require("../models/SwapRequest");
const { PROFILE_COMPLETE_REWARD_FIELDS } = require("./wallet");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const hasProfileValue = (value) =>
  typeof value === "string" ? value.trim().length > 0 : Boolean(value);

const getObject = (source) =>
  source && typeof source.toObject === "function" ? source.toObject() : source || {};

const calculateProfileCompleteness = (user) => {
  const source = getObject(user);
  const checks = PROFILE_COMPLETE_REWARD_FIELDS.map((field) => source[field]);

  return Math.round((checks.filter(hasProfileValue).length / PROFILE_COMPLETE_REWARD_FIELDS.length) * 100);
};

const calculateTrustScore = ({
  user,
  averageRating = 0,
  ratingCount = 0,
  completedSwaps = 0,
  activeListingsCount = 0,
}) => {
  const source = getObject(user);
  let score = 20;
  const profileCompleteness = calculateProfileCompleteness(source);

  if (source.isEmailVerified) {
    score += 20;
  }

  if (source.isPhoneVerified) {
    score += 10;
  }

  if (profileCompleteness >= 80) {
    score += 5;
  }

  score += Math.min(Number(completedSwaps || 0) * 4, 25);
  score += Number(ratingCount || 0) > 0 ? Math.round((Number(averageRating || 0) / 5) * 25) : 0;
  score += Math.min(Number(activeListingsCount || 0) * 2, 10);

  return clamp(score, 0, 100);
};

const getUserMetrics = async (user) => {
  const source = getObject(user);
  const userId = source._id || source.id;

  if (!userId) {
    return {
      rating: 0,
      rating_count: 0,
      completed_swaps: 0,
      total_swaps: 0,
      active_listings_count: 0,
      profile_completeness: 0,
      trust_score: 0,
    };
  }

  const swapParticipationFilter = {
    $or: [{ requester: userId }, { receiver: userId }],
  };

  const [ratings, totalSwaps, completedSwaps, activeListingsCount] = await Promise.all([
    Rating.find({ rated_user: userId }).select("score"),
    SwapRequest.countDocuments(swapParticipationFilter),
    SwapRequest.countDocuments({
      status: "completed",
      ...swapParticipationFilter,
    }),
    Product.countDocuments({
      owner_id: userId,
      status: { $in: ["available", "active"] },
    }),
  ]);

  const ratingCount = ratings.length;
  const averageRating = ratingCount
    ? Number((ratings.reduce((sum, rating) => sum + rating.score, 0) / ratingCount).toFixed(2))
    : 0;
  const profileCompleteness = calculateProfileCompleteness(source);
  const trustScore = calculateTrustScore({
    user: source,
    averageRating,
    ratingCount,
    completedSwaps,
    activeListingsCount,
  });

  return {
    rating: averageRating,
    rating_count: ratingCount,
    completed_swaps: completedSwaps,
    total_swaps: totalSwaps,
    active_listings_count: activeListingsCount,
    profile_completeness: profileCompleteness,
    trust_score: trustScore,
  };
};

module.exports = {
  calculateProfileCompleteness,
  calculateTrustScore,
  getUserMetrics,
};
