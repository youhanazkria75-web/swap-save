const Product = require("../models/Product");
const ProductView = require("../models/ProductView");
const User = require("../models/User");
const Rating = require("../models/Rating");
const Report = require("../models/Report");
const SwapRequest = require("../models/SwapRequest");
const asyncHandler = require("../utils/asyncHandler");
const {
  FEATURE_PRODUCT_COST,
  getWalletSummary,
  spendCoins,
} = require("../utils/wallet");
const { createNotification, notifyAdmins } = require("../utils/notifications");
const { buildFileUrl } = require("../utils/uploadUrls");
const { calculateTrustScore } = require("../utils/trustMetrics");
const mongoose = require("mongoose");

const FEATURED_OWNER_FIELDS =
  "_id first_name last_name avatar phone bio country city area street_address createdAt isEmailVerified isPhoneVerified rating rating_count role is_deleted";

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPartialRegex = (value) => new RegExp(escapeRegex(value), "i");

const buildExactRegex = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

const isTrueQueryValue = (value) =>
  ["true", "1", "yes"].includes(String(value || "").trim().toLowerCase());

const decodeHtmlEntities = (value) =>
  String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const readQueryString = (value) => {
  if (Array.isArray(value)) {
    return decodeHtmlEntities(value[0] || "").trim();
  }

  return decodeHtmlEntities(value || "").trim();
};

const serializeFeaturedOwner = (owner, metrics = {}) => {
  const rating = metrics.rating ?? owner.rating ?? 0;
  const ratingCount = metrics.rating_count ?? owner.rating_count ?? 0;
  const completedSwaps = metrics.completed_swaps || 0;
  const activeListingsCount = metrics.active_listings_count || 0;

  return {
    _id: owner._id,
    first_name: owner.first_name,
    last_name: owner.last_name,
    avatar: owner.avatar || "",
    country: owner.country || "",
    city: owner.city || "",
    area: owner.area || "",
    createdAt: owner.createdAt,
    isEmailVerified: Boolean(owner.isEmailVerified),
    isPhoneVerified: Boolean(owner.isPhoneVerified),
    rating,
    rating_count: ratingCount,
    completed_swaps: completedSwaps,
    active_listings_count: activeListingsCount,
    trust_score: calculateTrustScore({
      user: owner,
      averageRating: rating,
      ratingCount,
      completedSwaps,
      activeListingsCount,
    }),
  };
};

const getOwnerMetricsMap = async (ownerIds) => {
  const objectIds = [
    ...new Set(
      ownerIds
        .filter(Boolean)
        .map((ownerId) => String(ownerId))
    ),
  ].map((ownerId) => new mongoose.Types.ObjectId(ownerId));

  if (!objectIds.length) {
    return new Map();
  }

  const [completedSwapCounts, activeListingCounts, ratingStats] = await Promise.all([
    SwapRequest.aggregate([
      {
        $match: {
          status: "completed",
          $or: [
            { requester: { $in: objectIds } },
            { receiver: { $in: objectIds } },
          ],
        },
      },
      { $project: { participants: ["$requester", "$receiver"] } },
      { $unwind: "$participants" },
      { $match: { participants: { $in: objectIds } } },
      { $group: { _id: "$participants", count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      {
        $match: {
          owner_id: { $in: objectIds },
          status: "available",
        },
      },
      { $group: { _id: "$owner_id", count: { $sum: 1 } } },
    ]),
    Rating.aggregate([
      {
        $match: {
          rated_user: { $in: objectIds },
        },
      },
      {
        $group: {
          _id: "$rated_user",
          rating: { $avg: "$score" },
          rating_count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const metricsMap = new Map();

  objectIds.forEach((ownerId) => {
    metricsMap.set(String(ownerId), {
      completed_swaps: 0,
      active_listings_count: 0,
      rating: 0,
      rating_count: 0,
    });
  });

  completedSwapCounts.forEach((item) => {
    const metrics = metricsMap.get(String(item._id));
    if (metrics) metrics.completed_swaps = item.count || 0;
  });

  activeListingCounts.forEach((item) => {
    const metrics = metricsMap.get(String(item._id));
    if (metrics) metrics.active_listings_count = item.count || 0;
  });

  ratingStats.forEach((item) => {
    const metrics = metricsMap.get(String(item._id));
    if (metrics) {
      metrics.rating = Number((item.rating || 0).toFixed(2));
      metrics.rating_count = item.rating_count || 0;
    }
  });

  return metricsMap;
};

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
const PRIORITY_BOOST_DAYS = 7;
const PRIORITY_MATCH_SCORE_BONUS = 8;

const CONDITION_RANK = {
  poor: 0,
  fair: 1,
  good: 2,
  "like-new": 3,
  new: 4,
};

const normalizeComparableText = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isPriorityBoostActive = (product, now = new Date()) =>
  Boolean(product?.priority_boosted_until && new Date(product.priority_boosted_until) > now);

const scoreCategoryMatch = (sourceProduct, candidateProduct) => {
  const sourceCategory = normalizeComparableText(sourceProduct.category);
  const candidateCategory = normalizeComparableText(candidateProduct.category);

  if (!sourceCategory || !candidateCategory) {
    return { score: 0, reason: null };
  }

  if (sourceCategory === candidateCategory) {
    return { score: 30, reason: "Same category" };
  }

  return { score: 0, reason: null };
};

const scoreValueSimilarity = (sourceProduct, candidateProduct) => {
  const sourceValue = Number(sourceProduct.estimated_value || 0);
  const candidateValue = Number(candidateProduct.estimated_value || 0);

  if (sourceValue <= 0 || candidateValue <= 0) {
    return { score: 0, reason: null };
  }

  const differenceRatio = Math.abs(sourceValue - candidateValue) / Math.max(sourceValue, candidateValue);
  const score = Math.round(28 * Math.max(0, 1 - differenceRatio));

  if (score >= 22) {
    return { score, reason: "Similar estimated value" };
  }

  if (score >= 14) {
    return { score, reason: "Close value range" };
  }

  if (score > 0) {
    return { score, reason: "Acceptable value difference" };
  }

  return { score: 0, reason: null };
};

const scoreLocationSimilarity = (sourceProduct, candidateProduct) => {
  const sourceLocation = normalizeComparableText(sourceProduct.location);
  const candidateLocation = normalizeComparableText(candidateProduct.location);

  if (!sourceLocation || !candidateLocation) {
    return { score: 0, reason: null };
  }

  if (sourceLocation === candidateLocation) {
    return { score: 22, reason: "Same city" };
  }

  return { score: 0, reason: null };
};

const scoreConditionSimilarity = (sourceProduct, candidateProduct) => {
  const sourceCondition = normalizeComparableText(sourceProduct.condition);
  const candidateCondition = normalizeComparableText(candidateProduct.condition);

  if (!(sourceCondition in CONDITION_RANK) || !(candidateCondition in CONDITION_RANK)) {
    return { score: 0, reason: null };
  }

  const difference = Math.abs(CONDITION_RANK[sourceCondition] - CONDITION_RANK[candidateCondition]);

  if (difference === 0) {
    return { score: 20, reason: "Same condition" };
  }

  if (difference === 1) {
    return { score: 12, reason: "Similar condition" };
  }

  if (difference === 2) {
    return { score: 6, reason: "Comparable condition" };
  }

  return { score: 0, reason: null };
};

const scoreProductMatch = (sourceProduct, candidateProduct, { now = new Date() } = {}) => {
  const category = scoreCategoryMatch(sourceProduct, candidateProduct);
  const value = scoreValueSimilarity(sourceProduct, candidateProduct);
  const location = scoreLocationSimilarity(sourceProduct, candidateProduct);
  const condition = scoreConditionSimilarity(sourceProduct, candidateProduct);
  const baseScore = category.score + value.score + location.score + condition.score;
  const priorityBoostActive = isPriorityBoostActive(sourceProduct, now) && baseScore > 0;
  const priority = priorityBoostActive
    ? Math.min(PRIORITY_MATCH_SCORE_BONUS, 100 - baseScore)
    : 0;

  const scoreBreakdown = {
    category: category.score,
    value: value.score,
    location: location.score,
    condition: condition.score,
    priority,
  };

  const reasons = [
    { type: "category", label: category.reason, weight: category.score },
    { type: "value", label: value.reason, weight: value.score },
    { type: "location", label: location.reason, weight: location.score },
    { type: "condition", label: condition.reason, weight: condition.score },
    {
      type: "priority",
      label: priority > 0 ? "Priority boost on your listed product" : null,
      weight: priority,
    },
  ].filter((reason) => reason.label && reason.weight > 0);

  return {
    score: Math.min(100, baseScore + priority),
    baseScore,
    priority_boost_active: priorityBoostActive,
    reasons,
    scoreBreakdown,
  };
};

// POST /products
exports.createProduct = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    category,
    condition,
    estimated_value,
    location,
    images,
    subcategory,
    tags,
  } = req.body;

  if (!title || !category || !condition) {
    return res.status(400).json({ message: "title, category, condition are required" });
  }

  if (!mongoose.isValidObjectId(req.userId)) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const product = await Product.create({
    owner_id: req.userId,
    title,
    description: description || "",
    category,
    condition,
    estimated_value: estimated_value || 0,
    location: location || "",
    images: images || [],
    subcategory: subcategory || "",
    tags: tags || [],
    status: "available",
  });

  return res.status(201).json({ message: "Product created ✅", product });
});

// POST /products/upload
exports.uploadProductImages = asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    return res.status(400).json({ message: "At least one image is required" });
  }

  const images = files.map((file) => buildFileUrl(req, file.filename));

  return res.status(200).json({
    message: "Images uploaded successfully",
    images,
  });
});

exports.getProductById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (String(product.owner_id) !== String(req.userId)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  return res.status(200).json({ product });
});

exports.getPublicProductById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (!["available", "swapped"].includes(product.status)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const owner = await User.findById(product.owner_id).select(FEATURED_OWNER_FIELDS);

  if (!owner || owner.is_deleted) {
    return res.status(404).json({ message: "Owner not found" });
  }

  const ownerProducts = await Product.find({
    owner_id: product.owner_id,
    _id: { $ne: product._id },
    status: "available",
  })
    .sort({ createdAt: -1 })
    .limit(3);

  let savedProductIds = new Set();

  if (req.userId) {
    const currentUser = await User.findById(req.userId).select("saved_products");
    if (currentUser) {
      savedProductIds = new Set(
        currentUser.saved_products.map((savedProductId) => String(savedProductId))
      );
    }
  }

  const ownerMetrics = await getOwnerMetricsMap([owner._id]);
  const ownerId = String(owner._id);

  return res.status(200).json({
    product,
    owner: serializeFeaturedOwner(owner, ownerMetrics.get(ownerId) || {}),
    ownerProducts: ownerProducts.map((ownerProduct) => ({
      ...ownerProduct.toObject(),
      is_saved:
        String(ownerProduct.owner_id) !== String(req.userId || "") &&
        savedProductIds.has(String(ownerProduct._id)),
    })),
    is_saved:
      String(product.owner_id) !== String(req.userId || "") &&
      savedProductIds.has(String(product._id)),
  });
});

exports.reportProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (String(product.owner_id) === String(req.userId)) {
    return res.status(400).json({ message: "You cannot report your own listing" });
  }

  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  const description =
    typeof req.body.description === "string" ? req.body.description.trim() : "";

  if (!reason) {
    return res.status(400).json({ message: "Report reason is required" });
  }

  if (description.length > 2000) {
    return res.status(400).json({ message: "Report description cannot exceed 2000 characters" });
  }

  const report = await Report.create({
    reporter: req.userId,
    target_type: "product",
    target_id: product._id,
    reason,
    description,
  });

  await notifyAdmins({
    type: "report",
    title: "New product report",
    body: `A product listing was reported: ${product.title}`,
    target_type: "report",
    target_id: report._id,
    target_url: "/admin/reports",
  });

  return res.status(201).json({
    message: "Report submitted successfully",
    report: {
      id: String(report._id),
      target_type: report.target_type,
      target_id: report.target_id,
      reason: report.reason,
      description: report.description,
      status: report.status,
      createdAt: report.createdAt,
    },
  });
});

exports.incrementProductView = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (!["available", "swapped"].includes(product.status)) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (req.userId && String(product.owner_id) === String(req.userId)) {
    return res.status(200).json({
      message: "Owner views are not counted",
      view_count: product.view_count || 0,
      counted: false,
    });
  }

  const guestSessionId =
    typeof req.headers["x-view-session-id"] === "string"
      ? req.headers["x-view-session-id"].trim()
      : "";

  const viewerPayload = req.userId
    ? { viewer_user_id: req.userId }
    : guestSessionId
      ? { guest_session_id: guestSessionId }
      : null;

  if (!viewerPayload) {
    return res.status(200).json({
      message: "Missing viewer identity",
      view_count: product.view_count || 0,
      counted: false,
    });
  }

  let counted = false;

  const existingView = await ProductView.findOne({
    product_id: product._id,
    ...viewerPayload,
  }).select("_id");

  if (existingView) {
    return res.status(200).json({
      message: "View already counted",
      view_count: product.view_count || 0,
      counted: false,
    });
  }

  try {
    await ProductView.create({
      product_id: product._id,
      ...viewerPayload,
    });
    counted = true;
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }

  if (counted) {
    product.view_count = (product.view_count || 0) + 1;
    await product.save();

    if ([10, 50, 100].includes(product.view_count)) {
      await createNotification({
        user: product.owner_id,
        type: "system",
        title: `${product.view_count} product views`,
        body: `Your listing "${product.title}" reached ${product.view_count} views.`,
        target_type: "product",
        target_id: product._id,
        target_url: `/products/${product._id}`,
      });
    }
  }

  return res.status(200).json({
    message: counted ? "View count updated" : "View already counted",
    view_count: product.view_count || 0,
    counted,
  });
});

exports.toggleSavedProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(req.params.id).select("owner_id status saved_count title");

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const user = await User.findById(req.userId).select("_id first_name last_name saved_products");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const alreadySaved = user.saved_products.some(
    (savedProductId) => String(savedProductId) === String(product._id)
  );
  const isOwner = String(product.owner_id) === String(req.userId);

  if (isOwner && !alreadySaved) {
    return res.status(400).json({
      message: "You cannot save your own product",
      is_saved: false,
      saved_count: product.saved_count || 0,
    });
  }

  if (alreadySaved) {
    const updateResult = await User.updateOne(
      { _id: req.userId, saved_products: product._id },
      { $pull: { saved_products: product._id } }
    );

    if (updateResult.modifiedCount > 0) {
      await Product.updateOne(
        { _id: product._id, saved_count: { $gt: 0 } },
        { $inc: { saved_count: -1 } }
      );
    }

    const updatedProduct = await Product.findById(product._id).select("saved_count");

    return res.status(200).json({
      message: isOwner ? "Own product removed from saved items" : "Product removed from saved items",
      is_saved: false,
      saved_count: updatedProduct?.saved_count || 0,
    });
  }

  if (!["available", "swapped"].includes(product.status)) {
    return res.status(400).json({
      message: "Only public products can be saved",
      is_saved: false,
      saved_count: product.saved_count || 0,
    });
  }

  const updateResult = await User.updateOne(
    { _id: req.userId, saved_products: { $ne: product._id } },
    { $addToSet: { saved_products: product._id } }
  );

  if (updateResult.modifiedCount > 0) {
    await Product.updateOne(
      { _id: product._id },
      { $inc: { saved_count: 1 } }
    );

    await createNotification({
      user: product.owner_id,
      type: "system",
      title: "Product saved",
      body: `${[user.first_name, user.last_name].filter(Boolean).join(" ") || "Someone"} saved your product: ${product.title}`,
      target_type: "product",
      target_id: product._id,
      target_url: `/products/${product._id}`,
    });
  }

  const updatedProduct = await Product.findById(product._id).select("saved_count");

  return res.status(200).json({
    message: "Product saved",
    is_saved: true,
    saved_count: updatedProduct?.saved_count || 0,
  });
});

exports.getSavedProducts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select("saved_products");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const savedProductIds = [
    ...new Set(user.saved_products.map((savedProductId) => String(savedProductId))),
  ];

  if (!savedProductIds.length) {
    return res.status(200).json({ products: [] });
  }

  const products = await Product.find({
    _id: { $in: savedProductIds },
    owner_id: { $ne: req.userId },
    status: { $in: ["available", "swapped"] },
  }).populate("owner_id", FEATURED_OWNER_FIELDS);

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const ownerMetrics = await getOwnerMetricsMap(
    products
      .map((product) => product.owner_id?._id)
      .filter(Boolean)
  );
  const orderedProducts = savedProductIds
    .map((savedProductId) => productMap.get(String(savedProductId)))
    .filter(Boolean)
    .map((product) => {
      const productObject = product.toObject();
      const ownerId = product.owner_id?._id ? String(product.owner_id._id) : "";

      return {
        ...productObject,
        owner_id: product.owner_id?._id && !product.owner_id.is_deleted
          ? serializeFeaturedOwner(product.owner_id, ownerMetrics.get(ownerId) || {})
          : productObject.owner_id,
        is_saved: true,
      };
    });

  return res.status(200).json({ products: orderedProducts });
});

exports.getCategoryCounts = asyncHandler(async (req, res) => {
  const publicStatuses = ["available", "swapped"];

  const categoryCounts = await Product.aggregate([
    {
      $match: {
        status: { $in: publicStatuses },
        category: { $type: "string", $ne: "" },
      },
    },
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ]);

  const counts = Object.fromEntries(
    categoryCounts.map((item) => [item._id, item.count])
  );

  return res.status(200).json({ counts });
});

exports.getHomeSummary = asyncHandler(async (req, res) => {
  const publicProductStatuses = ["available", "swapped"];
  const browseCategoryStatuses = ["available", "swapped"];

  const [
    totalProducts,
    registeredUsers,
    completedSwaps,
    ratingStats,
    topCategories,
    categoryCounts,
  ] = await Promise.all([
    Product.countDocuments({ status: { $in: publicProductStatuses } }),
    User.countDocuments({ role: "user" }),
    SwapRequest.countDocuments({ status: "completed" }),
    Rating.aggregate([
      {
        $group: {
          _id: null,
          average_rating: { $avg: "$score" },
        },
      },
    ]),
    Product.aggregate([
      {
        $match: {
          status: "available",
          category: { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 5 },
    ]),
    Product.aggregate([
      {
        $match: {
          status: { $in: browseCategoryStatuses },
          category: { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  return res.status(200).json({
    stats: {
      total_products: totalProducts,
      registered_users: registeredUsers,
      completed_swaps: completedSwaps,
      average_rating: Number((ratingStats[0]?.average_rating || 0).toFixed(1)),
    },
    top_categories: topCategories.map((category) => ({
      name: category._id,
      count: category.count,
    })),
    category_counts: Object.fromEntries(
      categoryCounts.map((category) => [category._id, category.count])
    ),
  });
});

exports.getFeaturedProducts = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "4", 10) || 4, 12);

  const products = await Product.find({
    status: "available",
    is_featured: true,
    featured_until: { $gt: new Date() },
  })
    .populate("owner_id", FEATURED_OWNER_FIELDS)
    .sort({ featured_until: -1, createdAt: -1 })
    .limit(limit);

  let savedProductIds = new Set();

  if (req.userId) {
    const user = await User.findById(req.userId).select("saved_products");
    if (user) {
      savedProductIds = new Set(user.saved_products.map((savedProductId) => String(savedProductId)));
    }
  }

  const ownerIds = [
    ...new Set(
      products
        .map((product) => product.owner_id?._id)
        .filter(Boolean)
        .map((ownerId) => String(ownerId))
    ),
  ].map((ownerId) => new mongoose.Types.ObjectId(ownerId));

  const [completedSwapCounts, activeListingCounts, ratingStats] = ownerIds.length
    ? await Promise.all([
        SwapRequest.aggregate([
          {
            $match: {
              status: "completed",
              $or: [
                { requester: { $in: ownerIds } },
                { receiver: { $in: ownerIds } },
              ],
            },
          },
          { $project: { participants: ["$requester", "$receiver"] } },
          { $unwind: "$participants" },
          { $match: { participants: { $in: ownerIds } } },
          { $group: { _id: "$participants", count: { $sum: 1 } } },
        ]),
        Product.aggregate([
          {
            $match: {
              owner_id: { $in: ownerIds },
              status: "available",
            },
          },
          { $group: { _id: "$owner_id", count: { $sum: 1 } } },
        ]),
        Rating.aggregate([
          {
            $match: {
              rated_user: { $in: ownerIds },
            },
          },
          {
            $group: {
              _id: "$rated_user",
              rating: { $avg: "$score" },
              rating_count: { $sum: 1 },
            },
          },
        ]),
      ])
    : [[], [], []];

  const completedSwapCountMap = new Map(
    completedSwapCounts.map((item) => [String(item._id), item.count])
  );
  const activeListingCountMap = new Map(
    activeListingCounts.map((item) => [String(item._id), item.count])
  );
  const ratingMap = new Map(
    ratingStats.map((item) => [
      String(item._id),
      {
        rating: Number((item.rating || 0).toFixed(2)),
        rating_count: item.rating_count || 0,
      },
    ])
  );

  const serializedProducts = products.map((product) => {
    const productObject = product.toObject();
    const ownerId = product.owner_id?._id ? String(product.owner_id._id) : "";
    const rating = ratingMap.get(ownerId) || { rating: 0, rating_count: 0 };

    return {
      ...productObject,
      owner_id: product.owner_id?._id
        ? serializeFeaturedOwner(product.owner_id, {
            completed_swaps: completedSwapCountMap.get(ownerId) || 0,
            active_listings_count: activeListingCountMap.get(ownerId) || 0,
            rating: rating.rating,
            rating_count: rating.rating_count,
          })
        : productObject.owner_id,
      is_saved: ownerId !== String(req.userId || "") && savedProductIds.has(String(product._id)),
    };
  });

  return res.status(200).json({
    count: serializedProducts.length,
    products: serializedProducts,
  });
});

exports.getUserRecommendations = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.userId)) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const userId = new mongoose.Types.ObjectId(req.userId);

  const [availableSourceProducts, activeSwaps] = await Promise.all([
    Product.find({
      owner_id: userId,
      status: "available",
    }).sort({ createdAt: -1 }),
    SwapRequest.find({
      status: { $in: ACTIVE_SWAP_STATUSES },
    }).select("product_offered product_requested"),
  ]);

  if (availableSourceProducts.length === 0) {
    return res.status(200).json({
      source_products_count: 0,
      count: 0,
      recommendations: [],
      message: "List a product to unlock AI recommendations",
    });
  }

  const lockedProductIds = new Set();
  activeSwaps.forEach((swap) => {
    if (swap.product_offered) {
      lockedProductIds.add(String(swap.product_offered));
    }
    if (swap.product_requested) {
      lockedProductIds.add(String(swap.product_requested));
    }
  });

  const usableSourceProducts = availableSourceProducts.filter(
    (product) => !lockedProductIds.has(String(product._id))
  );

  if (usableSourceProducts.length === 0) {
    return res.status(200).json({
      source_products_count: availableSourceProducts.length,
      count: 0,
      recommendations: [],
      message: "No recommendations found yet",
    });
  }

  const candidateProducts = await Product.find({
    owner_id: { $ne: userId },
    status: "available",
    _id: { $nin: Array.from(lockedProductIds).map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .populate("owner_id", FEATURED_OWNER_FIELDS)
    .sort({ createdAt: -1 });

  const candidateOwnerIds = [
    ...new Set(
      candidateProducts
        .map((product) => product.owner_id?._id)
        .filter(Boolean)
        .map((ownerId) => String(ownerId))
    ),
  ].map((ownerId) => new mongoose.Types.ObjectId(ownerId));

  const ownerMetricsMap = await getOwnerMetricsMap(candidateOwnerIds);
  const now = new Date();

  const recommendations = candidateProducts
    .map((candidateProduct) => {
      const scoredMatches = usableSourceProducts.map((sourceProduct) => ({
        sourceProduct,
        ...scoreProductMatch(sourceProduct, candidateProduct, { now }),
      }));

      const bestMatch = scoredMatches.sort((a, b) => {
        if (a.priority_boost_active !== b.priority_boost_active) {
          return a.priority_boost_active ? -1 : 1;
        }

        return b.score - a.score;
      })[0];

      return {
        candidateProduct,
        userProduct: bestMatch.sourceProduct,
        score: bestMatch.score,
        baseScore: bestMatch.baseScore,
        priority_boost_active: bestMatch.priority_boost_active,
        reasons: bestMatch.reasons,
        scoreBreakdown: bestMatch.scoreBreakdown,
      };
    })
    .filter((recommendation) => recommendation.score > 0)
    .sort((a, b) => {
      if (a.priority_boost_active !== b.priority_boost_active) {
        return a.priority_boost_active ? -1 : 1;
      }

      return b.score - a.score;
    })
    .slice(0, 50)
    .map((recommendation) => {
      const candidateOwner = recommendation.candidateProduct.owner_id;
      const candidateOwnerId = candidateOwner?._id ? String(candidateOwner._id) : "";
      const ownerMetrics = ownerMetricsMap.get(candidateOwnerId) || {
        completed_swaps: 0,
        active_listings_count: 0,
        rating: 0,
        rating_count: 0,
      };
      const candidateProduct = recommendation.candidateProduct.toObject();

      if (candidateProduct.owner_id && candidateOwnerId) {
        candidateProduct.owner_id = serializeFeaturedOwner(candidateOwner, ownerMetrics);
      }

      return {
        candidate_product: candidateProduct,
        user_product: recommendation.userProduct,
        score: recommendation.score,
        base_score: recommendation.baseScore,
        priority_boost_active: recommendation.priority_boost_active,
        reasons: recommendation.reasons,
        scoreBreakdown: recommendation.scoreBreakdown,
        candidate_owner_rating: ownerMetrics.rating,
        candidate_owner_rating_count: ownerMetrics.rating_count,
        candidate_owner_trust_score: candidateProduct.owner_id?.trust_score || 0,
      };
    });

  return res.status(200).json({
    source_products_count: availableSourceProducts.length,
    usable_source_products_count: usableSourceProducts.length,
    count: recommendations.length,
    recommendations,
  });
});

// GET /products (Public) + Search/Filter + Pagination
exports.getAllProducts = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const q = readQueryString(req.query.q);
  const category = readQueryString(req.query.category);
  const condition = readQueryString(req.query.condition);
  const location = readQueryString(req.query.location);
  const requestedStatus = readQueryString(req.query.status || "available").toLowerCase();
  const sort = readQueryString(req.query.sort || "newest");
  const minValue = Number(req.query.min_value ?? req.query.minValue);
  const maxValue = Number(req.query.max_value ?? req.query.maxValue);

  const publicStatuses = ["available", "swapped"];
  const statusAliases = {
    active: "available",
    available: "available",
    swapped: "swapped",
  };

  if (![...publicStatuses, "active", "all"].includes(requestedStatus)) {
    return res.status(400).json({ message: "Invalid product status filter" });
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    "value-asc": { estimated_value: 1, createdAt: -1 },
    "value-desc": { estimated_value: -1, createdAt: -1 },
    popular: { view_count: -1, saved_count: -1, createdAt: -1 },
    featured: { is_featured: -1, featured_until: -1, createdAt: -1 },
  };

  const filter = {
    status: requestedStatus === "all"
      ? { $in: publicStatuses }
      : statusAliases[requestedStatus],
  };

  if (q) {
    const searchRegex = buildPartialRegex(q);

    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { category: searchRegex },
      { tags: searchRegex },
    ];
  }

  if (category) filter.category = buildExactRegex(category);
  if (condition) filter.condition = buildExactRegex(condition);
  if (location) filter.location = buildPartialRegex(location);
  if (Number.isFinite(minValue) || Number.isFinite(maxValue)) {
    filter.estimated_value = {};
    if (Number.isFinite(minValue)) {
      filter.estimated_value.$gte = minValue;
    }
    if (Number.isFinite(maxValue)) {
      filter.estimated_value.$lte = maxValue;
    }
  }
  if (isTrueQueryValue(req.query.featured)) {
    filter.is_featured = true;
    filter.featured_until = { $gt: new Date() };
  }

  const total = await Product.countDocuments(filter);

  const products = await Product.find(filter)
    .populate("owner_id", FEATURED_OWNER_FIELDS)
    .sort(sortOptions[sort] || sortOptions.newest)
    .skip(skip)
    .limit(limit);

  let savedProductIds = new Set();

  if (req.userId) {
    const user = await User.findById(req.userId).select("saved_products");
    if (user) {
      savedProductIds = new Set(user.saved_products.map((savedProductId) => String(savedProductId)));
    }
  }

  const ownerIds = [
    ...new Set(
      products
        .map((product) => product.owner_id?._id)
        .filter(Boolean)
        .map((ownerId) => String(ownerId))
    ),
  ].map((ownerId) => new mongoose.Types.ObjectId(ownerId));

  const [completedSwapCounts, activeListingCounts, ratingStats] = ownerIds.length
    ? await Promise.all([
        SwapRequest.aggregate([
          {
            $match: {
              status: "completed",
              $or: [
                { requester: { $in: ownerIds } },
                { receiver: { $in: ownerIds } },
              ],
            },
          },
          { $project: { participants: ["$requester", "$receiver"] } },
          { $unwind: "$participants" },
          { $match: { participants: { $in: ownerIds } } },
          { $group: { _id: "$participants", count: { $sum: 1 } } },
        ]),
        Product.aggregate([
          {
            $match: {
              owner_id: { $in: ownerIds },
              status: "available",
            },
          },
          { $group: { _id: "$owner_id", count: { $sum: 1 } } },
        ]),
        Rating.aggregate([
          {
            $match: {
              rated_user: { $in: ownerIds },
            },
          },
          {
            $group: {
              _id: "$rated_user",
              rating: { $avg: "$score" },
              rating_count: { $sum: 1 },
            },
          },
        ]),
      ])
    : [[], [], []];

  const completedSwapCountMap = new Map(
    completedSwapCounts.map((item) => [String(item._id), item.count])
  );
  const activeListingCountMap = new Map(
    activeListingCounts.map((item) => [String(item._id), item.count])
  );
  const ratingMap = new Map(
    ratingStats.map((item) => [
      String(item._id),
      {
        rating: Number((item.rating || 0).toFixed(2)),
        rating_count: item.rating_count || 0,
      },
    ])
  );

  const serializedProducts = products.map((product) => {
    const productObject = product.toObject();
    const ownerId = product.owner_id?._id ? String(product.owner_id._id) : "";
    const rating = ratingMap.get(ownerId) || { rating: 0, rating_count: 0 };

    return {
      ...productObject,
      owner_id: product.owner_id?._id
        ? serializeFeaturedOwner(product.owner_id, {
            completed_swaps: completedSwapCountMap.get(ownerId) || 0,
            active_listings_count: activeListingCountMap.get(ownerId) || 0,
            rating: rating.rating,
            rating_count: rating.rating_count,
          })
        : productObject.owner_id,
      is_saved: ownerId !== String(req.userId || "") && savedProductIds.has(String(product._id)),
    };
  });

  return res.status(200).json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    count: serializedProducts.length,
    products: serializedProducts,
  });
});

// GET /products/mine (Protected)
exports.getMyProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ owner_id: req.userId }).sort({ createdAt: -1 });
  return res.status(200).json({ products });
});

exports.featureProduct = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  if (!mongoose.isValidObjectId(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const existingProduct = await Product.findById(productId);

  if (!existingProduct) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (String(existingProduct.owner_id) !== String(req.userId)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  if (!["available", "active"].includes(existingProduct.status)) {
    return res.status(400).json({ message: "Only available products can be featured." });
  }

  const now = new Date();

  if (
    existingProduct.is_featured &&
    existingProduct.featured_until &&
    existingProduct.featured_until > now
  ) {
    return res.status(400).json({ message: "This product is already featured." });
  }

  const featuredUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const featuredProduct = await Product.findOneAndUpdate(
    {
      _id: productId,
      owner_id: req.userId,
      status: { $in: ["available", "active"] },
      $or: [
        { is_featured: { $ne: true } },
        { featured_until: { $exists: false } },
        { featured_until: null },
        { featured_until: { $lte: now } },
      ],
    },
    {
      $set: {
        is_featured: true,
        featured_until: featuredUntil,
      },
    },
    { new: true }
  );

  if (!featuredProduct) {
    return res.status(400).json({ message: "This product is already featured." });
  }

  try {
    await spendCoins({
      userId: req.userId,
      amount: FEATURE_PRODUCT_COST,
      type: "feature_product",
      description: `Featured product for 30 days for ${FEATURE_PRODUCT_COST} coins`,
      product: featuredProduct._id,
      metadata: {
        featured_until: featuredUntil,
        product_title: featuredProduct.title,
      },
    });
  } catch (error) {
    await Product.updateOne(
      {
        _id: productId,
        owner_id: req.userId,
        featured_until: featuredUntil,
      },
      {
        $set: { is_featured: false },
        $unset: { featured_until: "" },
      }
    );

    throw error;
  }

  return res.status(200).json({
    message: "Product featured for 30 days",
    product: featuredProduct,
    wallet: await getWalletSummary(req.userId),
  });
});

exports.applyPriorityBoost = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  if (!mongoose.isValidObjectId(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const now = new Date();
  const product = await Product.findOne({
    _id: productId,
    owner_id: req.userId,
    status: "available",
  });

  if (!product) {
    return res.status(404).json({ message: "Available product not found" });
  }

  if (isPriorityBoostActive(product, now)) {
    return res.status(400).json({ message: "This product already has an active priority boost" });
  }

  const boostedUntil = new Date(now.getTime() + PRIORITY_BOOST_DAYS * 24 * 60 * 60 * 1000);
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: req.userId,
      priority_matches_available: { $gt: 0 },
    },
    {
      $inc: { priority_matches_available: -1 },
    },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    return res.status(400).json({ message: "No priority matching credits available" });
  }

  const boostedProduct = await Product.findOneAndUpdate(
    {
      _id: product._id,
      owner_id: req.userId,
      status: "available",
      $or: [
        { priority_boosted_until: { $exists: false } },
        { priority_boosted_until: null },
        { priority_boosted_until: { $lte: now } },
      ],
    },
    {
      $set: {
        priority_boosted_at: now,
        priority_boosted_until: boostedUntil,
      },
    },
    { returnDocument: "after" }
  );

  if (!boostedProduct) {
    await User.updateOne(
      { _id: req.userId },
      { $inc: { priority_matches_available: 1 } }
    );

    return res.status(400).json({ message: "This product already has an active priority boost" });
  }

  return res.status(200).json({
    message: "Priority boost applied for 7 days",
    product: boostedProduct,
    wallet: await getWalletSummary(req.userId),
  });
});

// PUT /products/:id (Protected)
exports.updateProduct = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  if (!mongoose.isValidObjectId(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (String(product.owner_id) !== String(req.userId)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  if (product.status === "swapped") {
    return res.status(409).json({ message: "Swapped products cannot be edited." });
  }

  const allowedUpdates = {
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    subcategory: req.body.subcategory,
    condition: req.body.condition,
    estimated_value: req.body.estimated_value,
    location: req.body.location,
    images: req.body.images,
    tags: req.body.tags,
  };

  const updates = Object.fromEntries(
    Object.entries(allowedUpdates).filter(([, value]) => value !== undefined)
  );

  const updatedProduct = await Product.findByIdAndUpdate(productId, updates, { new: true });

  return res.json({
    message: "Product updated successfully ✏️",
    product: updatedProduct,
  });
});

// DELETE /products/:id (Protected)
exports.deleteProduct = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  if (!mongoose.isValidObjectId(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (String(product.owner_id) !== String(req.userId)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const linkedSwap = await SwapRequest.findOne({
    $or: [
      { product_offered: product._id },
      { product_requested: product._id },
    ],
  }).select("_id status");

  if (linkedSwap) {
    return res.status(409).json({
      message: "Products involved in swaps cannot be deleted because swap history must be preserved.",
      swap_id: linkedSwap._id,
      swap_status: linkedSwap.status,
    });
  }

  if (product.status === "swapped") {
    return res.status(400).json({ message: "Cannot delete a swapped product" });
  }

  await Product.findByIdAndDelete(productId);

  return res.json({ message: "Product deleted successfully 🗑️" });
});

// GET /products/recommendations/:productId
exports.getRecommendedProducts = asyncHandler(async (req, res) => {
  const productId = req.params.productId;

  if (!mongoose.isValidObjectId(productId)) {
    return res.status(404).json({ message: "Base product not found" });
  }

  const baseProduct = await Product.findOne({
    _id: productId,
    owner_id: req.userId,
    status: "available",
  });

  if (!baseProduct) {
    return res.status(404).json({ message: "Base product not found" });
  }

  const activeSwaps = await SwapRequest.find({
    status: { $in: ACTIVE_SWAP_STATUSES },
  }).select("product_offered product_requested");
  const lockedProductIds = new Set();

  activeSwaps.forEach((swap) => {
    if (swap.product_offered) {
      lockedProductIds.add(String(swap.product_offered));
    }
    if (swap.product_requested) {
      lockedProductIds.add(String(swap.product_requested));
    }
  });

  const excludedProductIds = [
    productId,
    ...Array.from(lockedProductIds),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const products = await Product.find({
    owner_id: { $ne: baseProduct.owner_id },
    status: "available",
    _id: { $nin: excludedProductIds },
  }).populate("owner_id", FEATURED_OWNER_FIELDS);

  const ownerIds = [
    ...new Set(
      products
        .map((product) => product.owner_id?._id)
        .filter(Boolean)
        .map((ownerId) => String(ownerId))
    ),
  ].map((ownerId) => new mongoose.Types.ObjectId(ownerId));
  const ownerMetricsMap = await getOwnerMetricsMap(ownerIds);
  const now = new Date();

  const scoredProducts = products.map((product) => {
    const match = scoreProductMatch(baseProduct, product, { now });

    // match level
    let match_level = "weak";

    if (match.score >= 80) {
      match_level = "excellent";
    } else if (match.score >= 60) {
      match_level = "strong";
    } else if (match.score >= 40) {
      match_level = "medium";
    }

    const productObject = product.toObject();
    const ownerId = product.owner_id?._id ? String(product.owner_id._id) : "";
    const ownerMetrics = ownerMetricsMap.get(ownerId);

    if (ownerId && ownerMetrics) {
      productObject.owner_id = serializeFeaturedOwner(product.owner_id, ownerMetrics);
    }

    return {
      score: match.score,
      base_score: match.baseScore,
      priority_boost_active: match.priority_boost_active,
      match_level,
      reasons: match.reasons.map((reason) => reason.label),
      scoreBreakdown: match.scoreBreakdown,
      product: productObject,
    };
  });

  const recommendations = scoredProducts
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (a.priority_boost_active !== b.priority_boost_active) {
        return a.priority_boost_active ? -1 : 1;
      }

      return b.score - a.score;
    })
    .slice(0, 10);

  return res.status(200).json({
    base_product: baseProduct,
    count: recommendations.length,
    recommendations,
  });
});
