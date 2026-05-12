const User = require("../models/User");
const Product = require("../models/Product");
const SwapRequest = require("../models/SwapRequest");
const Message = require("../models/Message");
const Report = require("../models/Report");
const Rating = require("../models/Rating");
const ContactMessage = require("../models/ContactMessage");
const Transaction = require("../models/Transaction");
const asyncHandler = require("../utils/asyncHandler");
const {
  addTimelineToSwap,
  createSwapTimelineEvent,
} = require("../utils/swapTimeline");
const { refundCompensationCoins } = require("../utils/swapCompensation");
const {
  DELIVERY_STATUS,
  getDeliveryStatusFromTracking,
  normalizeDeliveryTracking: normalizeDeliveryTrackingState,
} = require("../utils/deliveryLifecycle");
const { getWalletSummary } = require("../utils/wallet");
const { blockEmailForPlatform } = require("../utils/blockedAccounts");
const { createNotification, createNotifications } = require("../utils/notifications");
const { calculateTrustScore } = require("../utils/trustMetrics");
const {
  ADMIN_CANCELLABLE_SWAP_STATUSES,
  expirePendingServiceFeeTransactions,
  getCompletedServiceFeePaymentSummary,
} = require("../utils/swapCancellation");
const { sendSupportReplyEmail } = require("../config/email");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SWAP_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
  "disputed"
];

const CONTACT_MESSAGE_STATUSES = ["open", "in_review", "resolved", "dismissed"];
const CONTACT_MESSAGE_TYPES = ["general", "dispute", "report", "billing", "technical"];
const CONTACT_USER_REPLY_MAX_LENGTH = 5000;
const TRANSACTION_TYPES = [
  "signup_bonus",
  "coin_hold",
  "coin_release",
  "coin_credit",
  "coin_refund",
  "feature_product",
  "extra_swap_slot",
  "priority_matching",
  "swap_completion_reward",
  "phone_verification_reward",
  "profile_complete_reward",
  "admin_adjustment",
  "package_purchase_pending",
  "package_purchase_completed",
  "service_fee",
];
const TRANSACTION_DIRECTIONS = ["debit", "credit", "hold", "release", "refund", "adjustment"];
const ADJUSTMENT_DIRECTIONS = ["credit", "debit"];
const TRANSACTION_STATUSES = ["pending", "completed", "refunded", "failed", "expired"];

const RESTORABLE_DISPUTE_STATUSES = [
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
];
const CLOSED_REPORT_STATUSES = ["resolved", "dismissed"];
const REPORT_STATUSES = ["open", "under_review", "resolved", "dismissed"];
const REPORT_TARGET_TYPES = ["swap", "message", "product", "user"];
const REPORT_RESOLUTION_ACTIONS = ["dismiss", "resolve", "cancel_swap", "continue_swap"];
const TERMINAL_SWAP_STATUSES = ["completed", "cancelled", "rejected"];
const PRODUCT_STATUSES = ["available", "reserved", "swapped", "inactive", "rejected"];
const ACTIVE_SWAP_STATUSES_FOR_USER_DELETE = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
  "disputed",
];
const SUSPICIOUS_REPORT_THRESHOLD = 2;
const SUSPICIOUS_DISPUTE_THRESHOLD = 2;
const SUSPICIOUS_ADMIN_ADJUSTMENT_THRESHOLD = 3;
const SUSPICIOUS_ADMIN_ADJUSTMENT_WINDOW_DAYS = 30;
const SUSPICIOUS_REPORT_SPAM_THRESHOLD = 5;
const SUSPICIOUS_REPORT_SPAM_WINDOW_DAYS = 7;
const OPEN_REPORT_STATUSES = ["open", "under_review"];
const SUSPICIOUS_SOURCE_TYPES = [
  "user_reports",
  "product_reports",
  "excessive_disputes",
  "coin_adjustments",
  "report_spam",
];
const SUSPICIOUS_SEVERITIES = ["low", "medium", "high"];
const SUSPICIOUS_SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

const populateSwap = (query) =>
  query
    .populate("requester", "first_name last_name avatar email role createdAt")
    .populate("receiver", "first_name last_name avatar email role createdAt")
    .populate("product_offered")
    .populate("product_requested")
    .populate("admin_reviewed_by", "first_name last_name avatar email role");

const getAdminNote = (req) =>
  typeof req.body.admin_notes === "string"
    ? req.body.admin_notes.trim()
    : typeof req.body.adminNotes === "string"
      ? req.body.adminNotes.trim()
      : "";

const getOptionalContactUserReply = (body = {}) => {
  const hasUserReply = Object.prototype.hasOwnProperty.call(body, "user_reply");
  const hasUserReplyCamel = Object.prototype.hasOwnProperty.call(body, "userReply");

  if (!hasUserReply && !hasUserReplyCamel) {
    return { provided: false };
  }

  const value = hasUserReply ? body.user_reply : body.userReply;

  if (typeof value !== "string") {
    return { provided: true, error: "user_reply must be a string" };
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return { provided: true, error: "user_reply cannot be empty" };
  }

  if (trimmed.length > CONTACT_USER_REPLY_MAX_LENGTH) {
    return {
      provided: true,
      error: `user_reply cannot exceed ${CONTACT_USER_REPLY_MAX_LENGTH} characters`,
    };
  }

  return { provided: true, value: trimmed };
};

const notifySwapParticipants = async ({ swap, type, title, body }) => {
  await createNotifications([
    {
      user: swap.requester,
      type,
      title,
      body,
      related_swap: swap._id
    },
    {
      user: swap.receiver,
      type,
      title,
      body,
      related_swap: swap._id
    }
  ]);
};

const DELIVERY_TRACKING_ACTIONS = {
  mark_requester_picked_up: {
    key: "requester_item_picked_up",
    description: "Requester item marked as picked up by courier.",
  },
  mark_receiver_picked_up: {
    key: "receiver_item_picked_up",
    description: "Receiver item marked as picked up by courier.",
  },
  mark_delivered_to_requester: {
    key: "delivered_to_requester",
    description: "Requested item marked as delivered to requester.",
  },
  mark_delivered_to_receiver: {
    key: "delivered_to_receiver",
    description: "Offered item marked as delivered to receiver.",
  },
};

const getDeliveryUpdateCopy = (status, fallbackDescription) => {
  switch (status) {
    case DELIVERY_STATUS.PICKED_UP:
      return {
        event: "delivery_picked_up",
        title: "Pickup completed",
        body: fallbackDescription,
      };
    case DELIVERY_STATUS.IN_TRANSIT:
      return {
        event: "delivery_in_transit",
        title: "Delivery in transit",
        body: "Both items were picked up. Delivery is in transit.",
      };
    case DELIVERY_STATUS.DELIVERED_TO_RECEIVER:
      return {
        event: "delivery_delivered",
        title: "Item delivered",
        body: fallbackDescription,
      };
    case DELIVERY_STATUS.DELIVERY_COMPLETED:
      return {
        event: "delivery_completed",
        title: "Delivery completed",
        body: "Both items were delivered. You can confirm completion after inspecting your item.",
      };
    default:
      return {
        event: "delivery_tracking_updated",
        title: "Delivery tracking updated",
        body: fallbackDescription,
      };
  }
};

const populateReport = (query) =>
  query
    .populate("reporter", "first_name last_name avatar email role")
    .populate({
      path: "swap",
      populate: [
        { path: "requester", select: "first_name last_name avatar email role" },
        { path: "receiver", select: "first_name last_name avatar email role" },
        { path: "product_offered" },
        { path: "product_requested" },
      ],
    })
    .populate("resolved_by", "first_name last_name avatar email role");

const populateContactMessage = (query) =>
  query
    .populate("user_id", "_id first_name last_name avatar email role")
    .populate("replied_by", "_id first_name last_name avatar email role")
    .populate("resolved_by", "_id first_name last_name avatar email role");

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clampPaginationNumber = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
};

const serializeBasicUser = (user, { includeWallet = false } = {}) => {
  if (!user) {
    return null;
  }

  const source = typeof user.toObject === "function" ? user.toObject() : user;
  const firstName = source.first_name || "";
  const lastName = source.last_name || "";
  const serialized = {
    _id: source._id,
    id: String(source._id || source.id),
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: source.email || "",
    avatar: source.avatar || "",
  };

  if (includeWallet) {
    serialized.coins = Number(source.coins || 0);
  }

  return serialized;
};

const serializeRelatedSwap = (swap) => {
  if (!swap) {
    return null;
  }

  const source = typeof swap.toObject === "function" ? swap.toObject() : swap;

  return {
    _id: source._id,
    id: String(source._id || source.id),
    status: source.status,
  };
};

const serializeRelatedProduct = (product) => {
  if (!product) {
    return null;
  }

  const source = typeof product.toObject === "function" ? product.toObject() : product;

  return {
    _id: source._id,
    id: String(source._id || source.id),
    title: source.title || "",
    images: Array.isArray(source.images) ? source.images : [],
  };
};

const serializeAdminTransaction = (transaction) => {
  const source = transaction && typeof transaction.toObject === "function"
    ? transaction.toObject()
    : transaction;

  if (!source) {
    return null;
  }

  return {
    _id: source._id,
    id: String(source._id),
    user: serializeBasicUser(source.user),
    type: source.type,
    direction: source.direction,
    amount: Number(source.amount || 0),
    currency: source.currency || "coins",
    status: source.status,
    description: source.description || "",
    metadata: source.metadata || {},
    swap: serializeRelatedSwap(source.swap),
    product: serializeRelatedProduct(source.product),
    createdAt: source.createdAt,
  };
};

const countByValue = async (Model, field, values, filter = {}) => {
  const counts = Object.fromEntries(values.map((value) => [value, 0]));
  const rows = await Model.aggregate([
    { $match: filter },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
  ]);

  rows.forEach((row) => {
    if (row._id in counts) {
      counts[row._id] = row.count;
    }
  });

  return counts;
};

const countProductCategories = async () => {
  const rows = await Product.aggregate([
    { $match: { category: { $type: "string" } } },
    { $project: { category: { $trim: { input: "$category" } } } },
    { $match: { category: { $ne: "" } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return rows.map((row) => ({
    category: row._id,
    name: row._id,
    count: row.count,
  }));
};

const sumTransactionsByDirection = async () => {
  const counts = Object.fromEntries(TRANSACTION_DIRECTIONS.map((direction) => [direction, 0]));
  const rows = await Transaction.aggregate([
    { $match: { status: { $in: ["completed", "refunded"] }, currency: "coins" } },
    { $group: { _id: "$direction", amount: { $sum: "$amount" } } },
  ]);

  rows.forEach((row) => {
    if (row._id in counts) {
      counts[row._id] = row.amount;
    }
  });

  return counts;
};

const sumUserWalletField = async (field) => {
  const [row] = await User.aggregate([
    { $match: { is_deleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);

  return Number(row?.total || 0);
};

const serializeDashboardSwap = (swap) => {
  const source = swap && typeof swap.toObject === "function" ? swap.toObject() : swap;

  if (!source) {
    return null;
  }

  const requester = serializeBasicUser(source.requester);
  const receiver = serializeBasicUser(source.receiver);
  const offeredProduct = serializeRelatedProduct(source.product_offered);
  const requestedProduct = serializeRelatedProduct(source.product_requested);

  return {
    id: String(source._id),
    _id: source._id,
    status: source.status,
    requester,
    receiver,
    product_offered: offeredProduct,
    product_requested: requestedProduct,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const serializeDashboardReport = (report) => {
  const source = report && typeof report.toObject === "function" ? report.toObject() : report;

  if (!source) {
    return null;
  }

  return {
    id: String(source._id),
    _id: source._id,
    reporter: serializeBasicUser(source.reporter),
    target_type: source.target_type,
    target_id: source.target_id || null,
    status: source.status,
    reason: source.reason || "",
    description: source.description || "",
    swap: serializeDashboardSwap(source.swap),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const serializeDashboardContactMessage = (message) => {
  const source = message && typeof message.toObject === "function" ? message.toObject() : message;

  if (!source) {
    return null;
  }

  return {
    id: String(source._id),
    _id: source._id,
    full_name: source.full_name || "",
    email: source.email || "",
    inquiry_type: source.inquiry_type,
    subject: source.subject || "",
    status: source.status,
    user: serializeBasicUser(source.user_id),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const getTrustLevel = (score) => {
  if (score >= 70) {
    return "trusted";
  }

  if (score < 35) {
    return "risky";
  }

  return "new";
};

const toIdString = (value) => String(value?._id || value || "");

const mapCountsById = (rows, countKey = "count") =>
  new Map(rows.map((row) => [toIdString(row._id), Number(row[countKey] || 0)]));

const countReportsByTarget = async (targetType, targetIds, statuses) => {
  const ids = targetIds
    .map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null))
    .filter(Boolean);

  if (ids.length === 0) {
    return new Map();
  }

  const rows = await Report.aggregate([
    {
      $match: {
        target_type: targetType,
        target_id: { $in: ids },
        ...(statuses?.length ? { status: { $in: statuses } } : {}),
      },
    },
    { $group: { _id: "$target_id", count: { $sum: 1 } } },
  ]);

  return mapCountsById(rows);
};

const getAdminUserMetricsMap = async (users) => {
  const userIds = users
    .map((user) => user?._id)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (userIds.length === 0) {
    return new Map();
  }

  const [swapRows, productRows, ratingRows, reportRows] = await Promise.all([
    SwapRequest.aggregate([
      {
        $match: {
          $or: [
            { requester: { $in: userIds } },
            { receiver: { $in: userIds } },
          ],
        },
      },
      {
        $project: {
          status: 1,
          participant: ["$requester", "$receiver"],
        },
      },
      { $unwind: "$participant" },
      { $match: { participant: { $in: userIds } } },
      {
        $group: {
          _id: "$participant",
          total_swaps: { $sum: 1 },
          completed_swaps: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]),
    Product.aggregate([
      { $match: { owner_id: { $in: userIds } } },
      {
        $group: {
          _id: "$owner_id",
          listings_count: { $sum: 1 },
          active_listings_count: {
            $sum: { $cond: [{ $eq: ["$status", "available"] }, 1, 0] },
          },
        },
      },
    ]),
    Rating.aggregate([
      { $match: { rated_user: { $in: userIds } } },
      {
        $group: {
          _id: "$rated_user",
          rating: { $avg: "$score" },
          rating_count: { $sum: 1 },
        },
      },
    ]),
    Report.aggregate([
      { $match: { target_type: "user", target_id: { $in: userIds } } },
      {
        $group: {
          _id: "$target_id",
          report_count: { $sum: 1 },
          open_report_count: {
            $sum: { $cond: [{ $in: ["$status", ["open", "under_review"]] }, 1, 0] },
          },
        },
      },
    ]),
  ]);

  const metrics = new Map();

  userIds.forEach((id) => {
    metrics.set(toIdString(id), {
      total_swaps: 0,
      completed_swaps: 0,
      listings_count: 0,
      active_listings_count: 0,
      rating: 0,
      rating_count: 0,
      report_count: 0,
      open_report_count: 0,
    });
  });

  swapRows.forEach((row) => {
    const current = metrics.get(toIdString(row._id));
    if (current) {
      current.total_swaps = Number(row.total_swaps || 0);
      current.completed_swaps = Number(row.completed_swaps || 0);
    }
  });

  productRows.forEach((row) => {
    const current = metrics.get(toIdString(row._id));
    if (current) {
      current.listings_count = Number(row.listings_count || 0);
      current.active_listings_count = Number(row.active_listings_count || 0);
    }
  });

  ratingRows.forEach((row) => {
    const current = metrics.get(toIdString(row._id));
    if (current) {
      current.rating = Number(Number(row.rating || 0).toFixed(2));
      current.rating_count = Number(row.rating_count || 0);
    }
  });

  reportRows.forEach((row) => {
    const current = metrics.get(toIdString(row._id));
    if (current) {
      current.report_count = Number(row.report_count || 0);
      current.open_report_count = Number(row.open_report_count || 0);
    }
  });

  return metrics;
};

const serializeAdminUser = (user, metrics = {}) => {
  const source = user && typeof user.toObject === "function" ? user.toObject() : user;

  if (!source) {
    return null;
  }

  const isDeleted = source.is_deleted === true;
  const isAdmin = source.role === "admin";
  const isEmailVerified = source.isEmailVerified === true;
  const accountStatus = isDeleted
    ? "deleted"
    : isEmailVerified
      ? "active"
      : "pending_verification";
  const firstName = isDeleted ? "Deleted" : source.first_name || "";
  const lastName = isDeleted ? "User" : source.last_name || "";
  const rating = metrics.rating_count > 0
    ? Number(metrics.rating || 0)
    : Number(source.rating || 0);
  const ratingCount = metrics.rating_count > 0
    ? Number(metrics.rating_count || 0)
    : Number(source.rating_count || 0);
  const trustScore = isDeleted
    ? 0
    : isAdmin
      ? null
      : calculateTrustScore({
        user: source,
        averageRating: rating,
        ratingCount,
        completedSwaps: metrics.completed_swaps || 0,
        activeListingsCount: metrics.active_listings_count || 0,
      });

  return {
    _id: source._id,
    id: String(source._id),
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: isDeleted ? source.email || "deleted-user@example.invalid" : source.email || "",
    avatar: isDeleted ? "" : source.avatar || "",
    role: source.role || "user",
    trust_score: trustScore,
    trust_level: isAdmin && !isDeleted ? "admin" : getTrustLevel(trustScore),
    rating,
    rating_count: ratingCount,
    total_swaps: Number(metrics.total_swaps || 0),
    completed_swaps: Number(metrics.completed_swaps || 0),
    coins: Number(source.coins || 0),
    held_coins: Number(source.held_coins || 0),
    isEmailVerified,
    isPhoneVerified: Boolean(source.isPhoneVerified),
    is_deleted: isDeleted,
    deleted_at: source.deleted_at || null,
    account_status: accountStatus,
    report_count: Number(metrics.report_count || 0),
    open_report_count: Number(metrics.open_report_count || 0),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const serializeAdminProductOwner = (owner) => {
  const source = owner && typeof owner.toObject === "function" ? owner.toObject() : owner;

  if (!source) {
    return {
      id: "",
      _id: null,
      name: "Deleted user",
      first_name: "Deleted",
      last_name: "User",
      email: "",
      avatar: "",
      is_deleted: true,
    };
  }

  const isDeleted = source.is_deleted === true;
  const firstName = isDeleted ? "Deleted" : source.first_name || "";
  const lastName = isDeleted ? "User" : source.last_name || "";

  return {
    _id: source._id,
    id: String(source._id || source.id || ""),
    first_name: firstName,
    last_name: lastName,
    name: `${firstName} ${lastName}`.trim(),
    email: isDeleted ? "" : source.email || "",
    avatar: isDeleted ? "" : source.avatar || "",
    is_deleted: isDeleted,
  };
};

const serializeAdminProduct = (product, reportCount = 0) => {
  const source = product && typeof product.toObject === "function" ? product.toObject() : product;

  if (!source) {
    return null;
  }

  return {
    _id: source._id,
    id: String(source._id),
    title: source.title || "",
    images: Array.isArray(source.images) ? source.images : [],
    owner: serializeAdminProductOwner(source.owner_id),
    owner_id: toIdString(source.owner_id?._id || source.owner_id),
    category: source.category || "",
    condition: source.condition || "",
    estimated_value: Number(source.estimated_value || 0),
    status: source.status || "available",
    view_count: Number(source.view_count || 0),
    saved_count: Number(source.saved_count || 0),
    is_featured: Boolean(source.is_featured),
    featured_until: source.featured_until || null,
    report_count: Number(reportCount || 0),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const getSwapReportCountMaps = async (swapIds) => {
  const ids = swapIds
    .map((id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null))
    .filter(Boolean);

  if (!ids.length) {
    return {
      reportCounts: new Map(),
      openReportCounts: new Map(),
    };
  }

  const rows = await Report.aggregate([
    {
      $match: {
        $or: [
          { swap: { $in: ids } },
          { target_type: "swap", target_id: { $in: ids } },
        ],
      },
    },
    {
      $group: {
        _id: { $ifNull: ["$swap", "$target_id"] },
        report_count: { $sum: 1 },
        open_report_count: {
          $sum: { $cond: [{ $in: ["$status", ["open", "under_review"]] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    reportCounts: new Map(rows.map((row) => [toIdString(row._id), Number(row.report_count || 0)])),
    openReportCounts: new Map(rows.map((row) => [toIdString(row._id), Number(row.open_report_count || 0)])),
  };
};

const attachReportCountsToSwaps = async (swaps) => {
  const { reportCounts, openReportCounts } = await getSwapReportCountMaps(swaps.map((swap) => swap._id));

  return swaps.map((swap) => {
    const source = swap && typeof swap.toObject === "function" ? swap.toObject() : swap;
    const id = toIdString(source._id);

    return {
      ...source,
      report_count: reportCounts.get(id) || 0,
      open_report_count: openReportCounts.get(id) || 0,
    };
  });
};

const getTargetIdsByType = (reports, targetType) =>
  reports
    .filter((report) => report.target_type === targetType && report.target_id)
    .map((report) => report.target_id)
    .filter((id) => mongoose.isValidObjectId(id));

const getReportTargetLabel = (report, targetMaps) => {
  const targetId = toIdString(report.target_id);

  if (report.target_type === "swap") {
    const swapId = toIdString(report.swap?._id || report.swap || report.target_id);
    return swapId ? `Swap ${swapId}` : "Swap";
  }

  if (report.target_type === "product") {
    const product = targetMaps.products.get(targetId);
    return product?.title || `Product ${targetId}`;
  }

  if (report.target_type === "user") {
    const user = targetMaps.users.get(targetId);
    if (user) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || `User ${targetId}`;
    }

    return `User ${targetId}`;
  }

  if (report.target_type === "message") {
    const message = targetMaps.messages.get(targetId);
    if (message?.content) {
      return message.content.length > 70
        ? `${message.content.slice(0, 67)}...`
        : message.content;
    }

    return `Message ${targetId}`;
  }

  return targetId;
};

const getReportTargetUrl = (report, targetMaps) => {
  const swapId = toIdString(report.swap?._id || report.swap);

  if (report.target_type === "swap") {
    const targetSwapId = swapId || toIdString(report.target_id);
    return targetSwapId ? `/admin/swaps/${targetSwapId}` : "/admin/swaps";
  }

  if (report.target_type === "message") {
    const message = targetMaps.messages.get(toIdString(report.target_id));
    const messageSwapId = toIdString(message?.swap) || swapId;
    return messageSwapId ? `/admin/swaps/${messageSwapId}` : "/admin/swaps";
  }

  if (report.target_type === "product") {
    return "/admin/products?reported=true";
  }

  if (report.target_type === "user") {
    return "/admin/users?reported=true";
  }

  return "";
};

const enrichAdminReports = async (reports) => {
  const sources = reports.map((report) =>
    report && typeof report.toObject === "function" ? report.toObject() : report
  );
  const [targetProducts, targetUsers, targetMessages] = await Promise.all([
    Product.find({ _id: { $in: getTargetIdsByType(sources, "product") } })
      .select("_id title images status category owner_id")
      .populate("owner_id", "_id first_name last_name email avatar is_deleted"),
    User.find({ _id: { $in: getTargetIdsByType(sources, "user") } })
      .select("_id first_name last_name email avatar role is_deleted"),
    Message.find({ _id: { $in: getTargetIdsByType(sources, "message") } })
      .select("_id swap sender content is_reported report_reason createdAt")
      .populate("sender", "_id first_name last_name email avatar role is_deleted"),
  ]);
  const targetMaps = {
    products: new Map(targetProducts.map((product) => [toIdString(product._id), product.toObject()])),
    users: new Map(targetUsers.map((user) => [toIdString(user._id), user.toObject()])),
    messages: new Map(targetMessages.map((message) => [toIdString(message._id), message.toObject()])),
  };

  return sources.map((report) => {
    const targetId = toIdString(report.target_id);
    const target = {
      type: report.target_type,
      id: targetId,
      label: getReportTargetLabel(report, targetMaps),
      url: getReportTargetUrl(report, targetMaps),
      product: report.target_type === "product" ? targetMaps.products.get(targetId) || null : null,
      user: report.target_type === "user" ? serializeAdminProductOwner(targetMaps.users.get(targetId)) : null,
      message: report.target_type === "message" ? targetMaps.messages.get(targetId) || null : null,
    };
    const swapId = toIdString(report.swap?._id || report.swap || (report.target_type === "swap" ? report.target_id : ""));

    return {
      ...report,
      id: toIdString(report._id),
      reporter: serializeBasicUser(report.reporter),
      resolved_by: serializeBasicUser(report.resolved_by),
      target,
      related_swap_id: swapId || null,
      current_swap_status: report.swap?.status || null,
    };
  });
};

const reportMatchesSearch = (report, query) => {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase();
  const values = [
    report.id,
    toIdString(report._id),
    report.reason,
    report.description,
    report.status,
    report.target_type,
    toIdString(report.target_id),
    report.related_swap_id,
    report.current_swap_status,
    report.reporter?.name,
    report.reporter?.email,
    report.target?.label,
    report.target?.product?.title,
    report.target?.user?.name,
    report.target?.user?.email,
    report.target?.message?.content,
  ];

  return values.some((value) => String(value || "").toLowerCase().includes(normalized));
};

const getSuspiciousSeverity = (count, mediumAt, highAt) => {
  if (count >= highAt) {
    return "high";
  }

  if (count >= mediumAt) {
    return "medium";
  }

  return "low";
};

const serializeSuspiciousUser = (user) => {
  const basic = serializeBasicUser(user);

  if (!basic) {
    return null;
  }

  const source = typeof user.toObject === "function" ? user.toObject() : user;

  return {
    ...basic,
    role: source.role || "user",
    is_deleted: source.is_deleted === true,
  };
};

const serializeSuspiciousProduct = (product) => {
  if (!product) {
    return null;
  }

  const source = typeof product.toObject === "function" ? product.toObject() : product;

  return {
    id: toIdString(source._id || source.id),
    _id: source._id,
    title: source.title || "",
    status: source.status || "",
    category: source.category || "",
    owner: serializeSuspiciousUser(source.owner_id),
  };
};

const serializeSuspiciousReport = (report) => {
  if (!report) {
    return null;
  }

  const source = typeof report.toObject === "function" ? report.toObject() : report;

  return {
    id: toIdString(source._id),
    _id: source._id,
    target_type: source.target_type,
    target_id: toIdString(source.target_id),
    status: source.status,
    reason: source.reason || "",
    description: source.description || "",
    reporter: serializeBasicUser(source.reporter),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

const getRecentReportsByTarget = async (targetType, targetIds) => {
  const ids = targetIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (ids.length === 0) {
    return new Map();
  }

  const reports = await Report.find({
    target_type: targetType,
    target_id: { $in: ids },
  })
    .populate("reporter", "_id first_name last_name email avatar")
    .sort({ createdAt: -1 });

  const grouped = new Map();

  reports.forEach((report) => {
    const key = toIdString(report.target_id);
    const current = grouped.get(key) || [];

    if (current.length < 5) {
      current.push(serializeSuspiciousReport(report));
    }

    grouped.set(key, current);
  });

  return grouped;
};

const buildUserReportSuspiciousActivities = async () => {
  const rows = await Report.aggregate([
    {
      $match: {
        target_type: "user",
        target_id: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$target_id",
        report_count: { $sum: 1 },
        open_count: {
          $sum: {
            $cond: [{ $in: ["$status", OPEN_REPORT_STATUSES] }, 1, 0],
          },
        },
        latest_at: { $max: "$createdAt" },
      },
    },
    { $match: { report_count: { $gte: SUSPICIOUS_REPORT_THRESHOLD } } },
  ]);
  const targetIds = rows.map((row) => row._id);
  const [users, reportsByTarget] = await Promise.all([
    User.find({ _id: { $in: targetIds } }).select("_id first_name last_name email avatar role is_deleted"),
    getRecentReportsByTarget("user", targetIds),
  ]);
  const usersById = new Map(users.map((user) => [toIdString(user._id), user]));

  return rows.map((row) => {
    const targetId = toIdString(row._id);
    const user = usersById.get(targetId);
    const targetUser = serializeSuspiciousUser(user);
    const displayName = targetUser?.name || targetUser?.email || `User ${targetId}`;

    return {
      id: `user_reports:${targetId}`,
      source: "user_reports",
      source_label: "Repeated user reports",
      target_type: "user",
      target_id: targetId,
      severity: getSuspiciousSeverity(row.report_count, 3, 5),
      title: "Repeated reports against user",
      description: `${displayName} has ${row.report_count} report${row.report_count === 1 ? "" : "s"} filed against them, with ${row.open_count || 0} still open or in review.`,
      count: Number(row.report_count || 0),
      open_count: Number(row.open_count || 0),
      latest_at: row.latest_at,
      target_user: targetUser,
      target_product: null,
      reports: reportsByTarget.get(targetId) || [],
      actions: {
        reports_url: `/admin/reports?target_type=user&q=${encodeURIComponent(targetId)}`,
        user_url: targetId ? `/users/${targetId}` : "",
        product_url: "",
      },
    };
  });
};

const buildProductReportSuspiciousActivities = async () => {
  const rows = await Report.aggregate([
    {
      $match: {
        target_type: "product",
        target_id: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$target_id",
        report_count: { $sum: 1 },
        open_count: {
          $sum: {
            $cond: [{ $in: ["$status", OPEN_REPORT_STATUSES] }, 1, 0],
          },
        },
        latest_at: { $max: "$createdAt" },
      },
    },
    { $match: { report_count: { $gte: SUSPICIOUS_REPORT_THRESHOLD } } },
  ]);
  const targetIds = rows.map((row) => row._id);
  const [products, reportsByTarget] = await Promise.all([
    Product.find({ _id: { $in: targetIds } })
      .select("_id title status category owner_id")
      .populate("owner_id", "_id first_name last_name email avatar role is_deleted"),
    getRecentReportsByTarget("product", targetIds),
  ]);
  const productsById = new Map(products.map((product) => [toIdString(product._id), product]));

  return rows.map((row) => {
    const targetId = toIdString(row._id);
    const product = productsById.get(targetId);
    const targetProduct = serializeSuspiciousProduct(product);
    const displayName = targetProduct?.title || `Product ${targetId}`;

    return {
      id: `product_reports:${targetId}`,
      source: "product_reports",
      source_label: "Repeated product reports",
      target_type: "product",
      target_id: targetId,
      severity: getSuspiciousSeverity(row.report_count, 3, 5),
      title: "Repeated reports against product",
      description: `${displayName} has ${row.report_count} report${row.report_count === 1 ? "" : "s"} filed against it, with ${row.open_count || 0} still open or in review.`,
      count: Number(row.report_count || 0),
      open_count: Number(row.open_count || 0),
      latest_at: row.latest_at,
      target_user: targetProduct?.owner || null,
      target_product: targetProduct,
      reports: reportsByTarget.get(targetId) || [],
      actions: {
        reports_url: `/admin/reports?target_type=product&q=${encodeURIComponent(targetId)}`,
        user_url: targetProduct?.owner?.id ? `/users/${targetProduct.owner.id}` : "",
        product_url: targetId ? `/products/${targetId}` : "",
      },
    };
  });
};

const getSwapReportsBySwapId = async (swapIds) => {
  const ids = swapIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  if (ids.length === 0) {
    return new Map();
  }

  const reports = await Report.find({
    target_type: "swap",
    $or: [
      { target_id: { $in: ids } },
      { swap: { $in: ids } },
    ],
  })
    .populate("reporter", "_id first_name last_name email avatar")
    .sort({ createdAt: -1 });
  const grouped = new Map();

  reports.forEach((report) => {
    const key = toIdString(report.swap || report.target_id);
    const current = grouped.get(key) || [];

    if (current.length < 5) {
      current.push(serializeSuspiciousReport(report));
    }

    grouped.set(key, current);
  });

  return grouped;
};

const buildDisputeSuspiciousActivities = async () => {
  const rows = await SwapRequest.aggregate([
    { $match: { status: "disputed" } },
    {
      $project: {
        participants: ["$requester", "$receiver"],
        updatedAt: 1,
      },
    },
    { $unwind: "$participants" },
    {
      $group: {
        _id: "$participants",
        dispute_count: { $sum: 1 },
        latest_at: { $max: "$updatedAt" },
        swap_ids: { $addToSet: "$_id" },
      },
    },
    { $match: { dispute_count: { $gte: SUSPICIOUS_DISPUTE_THRESHOLD } } },
  ]);
  const userIds = rows.map((row) => row._id);
  const swapIds = rows.flatMap((row) => row.swap_ids || []);
  const [users, reportsBySwap] = await Promise.all([
    User.find({ _id: { $in: userIds } }).select("_id first_name last_name email avatar role is_deleted"),
    getSwapReportsBySwapId(swapIds),
  ]);
  const usersById = new Map(users.map((user) => [toIdString(user._id), user]));

  return rows.map((row) => {
    const targetId = toIdString(row._id);
    const targetUser = serializeSuspiciousUser(usersById.get(targetId));
    const displayName = targetUser?.name || targetUser?.email || `User ${targetId}`;
    const reports = (row.swap_ids || [])
      .flatMap((swapId) => reportsBySwap.get(toIdString(swapId)) || [])
      .slice(0, 5);
    const firstSwapId = toIdString(row.swap_ids?.[0]);

    return {
      id: `excessive_disputes:${targetId}`,
      source: "excessive_disputes",
      source_label: "Excessive disputes",
      target_type: "user",
      target_id: targetId,
      severity: getSuspiciousSeverity(row.dispute_count, 3, 5),
      title: "Repeated active disputes",
      description: `${displayName} is involved in ${row.dispute_count} currently disputed swap${row.dispute_count === 1 ? "" : "s"}.`,
      count: Number(row.dispute_count || 0),
      open_count: Number(row.dispute_count || 0),
      latest_at: row.latest_at,
      target_user: targetUser,
      target_product: null,
      reports,
      actions: {
        reports_url: firstSwapId ? `/admin/reports?target_type=swap&q=${encodeURIComponent(firstSwapId)}` : "/admin/reports?target_type=swap",
        user_url: targetId ? `/users/${targetId}` : "",
        product_url: "",
      },
    };
  });
};

const buildCoinAdjustmentSuspiciousActivities = async () => {
  const since = new Date(Date.now() - SUSPICIOUS_ADMIN_ADJUSTMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await Transaction.aggregate([
    {
      $match: {
        type: "admin_adjustment",
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: "$user",
        adjustment_count: { $sum: 1 },
        total_amount: { $sum: "$amount" },
        latest_at: { $max: "$createdAt" },
      },
    },
    { $match: { adjustment_count: { $gte: SUSPICIOUS_ADMIN_ADJUSTMENT_THRESHOLD } } },
  ]);
  const userIds = rows.map((row) => row._id);
  const users = await User.find({ _id: { $in: userIds } }).select("_id first_name last_name email avatar role is_deleted");
  const usersById = new Map(users.map((user) => [toIdString(user._id), user]));

  return rows.map((row) => {
    const targetId = toIdString(row._id);
    const targetUser = serializeSuspiciousUser(usersById.get(targetId));
    const displayName = targetUser?.name || targetUser?.email || `User ${targetId}`;

    return {
      id: `coin_adjustments:${targetId}`,
      source: "coin_adjustments",
      source_label: "Repeated coin adjustments",
      target_type: "user",
      target_id: targetId,
      severity: getSuspiciousSeverity(row.adjustment_count, 4, 6),
      title: "Repeated admin coin adjustments",
      description: `${displayName} has ${row.adjustment_count} admin coin adjustment${row.adjustment_count === 1 ? "" : "s"} in the last ${SUSPICIOUS_ADMIN_ADJUSTMENT_WINDOW_DAYS} days.`,
      count: Number(row.adjustment_count || 0),
      open_count: 0,
      latest_at: row.latest_at,
      target_user: targetUser,
      target_product: null,
      total_amount: Number(row.total_amount || 0),
      reports: [],
      actions: {
        reports_url: "",
        user_url: targetId ? `/users/${targetId}` : "",
        product_url: "",
      },
    };
  });
};

const buildReportSpamSuspiciousActivities = async () => {
  const since = new Date(Date.now() - SUSPICIOUS_REPORT_SPAM_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = await Report.aggregate([
    {
      $match: {
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: "$reporter",
        report_count: { $sum: 1 },
        latest_at: { $max: "$createdAt" },
      },
    },
    { $match: { report_count: { $gte: SUSPICIOUS_REPORT_SPAM_THRESHOLD } } },
  ]);
  const userIds = rows.map((row) => row._id);
  const users = await User.find({ _id: { $in: userIds } }).select("_id first_name last_name email avatar role is_deleted");
  const usersById = new Map(users.map((user) => [toIdString(user._id), user]));

  return rows.map((row) => {
    const targetId = toIdString(row._id);
    const targetUser = serializeSuspiciousUser(usersById.get(targetId));
    const displayName = targetUser?.name || targetUser?.email || `User ${targetId}`;

    return {
      id: `report_spam:${targetId}`,
      source: "report_spam",
      source_label: "Report spam",
      target_type: "user",
      target_id: targetId,
      severity: getSuspiciousSeverity(row.report_count, 8, 12),
      title: "High report submission volume",
      description: `${displayName} submitted ${row.report_count} report${row.report_count === 1 ? "" : "s"} in the last ${SUSPICIOUS_REPORT_SPAM_WINDOW_DAYS} days.`,
      count: Number(row.report_count || 0),
      open_count: 0,
      latest_at: row.latest_at,
      target_user: targetUser,
      target_product: null,
      reports: [],
      actions: {
        reports_url: `/admin/reports?q=${encodeURIComponent(targetUser?.email || targetId)}`,
        user_url: targetId ? `/users/${targetId}` : "",
        product_url: "",
      },
    };
  });
};

const suspiciousActivityMatchesSearch = (activity, query) => {
  if (!query) {
    return true;
  }

  const normalized = query.toLowerCase();
  const values = [
    activity.id,
    activity.source_label,
    activity.title,
    activity.description,
    activity.severity,
    activity.target_id,
    activity.target_user?.name,
    activity.target_user?.email,
    activity.target_product?.title,
    activity.target_product?.category,
  ];

  return values.some((value) => String(value || "").toLowerCase().includes(normalized));
};

const summarizeSuspiciousActivities = (activities) => ({
  total: activities.length,
  high: activities.filter((activity) => activity.severity === "high").length,
  medium: activities.filter((activity) => activity.severity === "medium").length,
  low: activities.filter((activity) => activity.severity === "low").length,
  user_reports: activities.filter((activity) => activity.source === "user_reports").length,
  product_reports: activities.filter((activity) => activity.source === "product_reports").length,
  excessive_disputes: activities.filter((activity) => activity.source === "excessive_disputes").length,
  coin_adjustments: activities.filter((activity) => activity.source === "coin_adjustments").length,
  report_spam: activities.filter((activity) => activity.source === "report_spam").length,
});

const findTransactionUserCandidates = async (userQuery) => {
  const trimmed = typeof userQuery === "string" ? userQuery.trim() : "";

  if (!trimmed) {
    return [];
  }

  if (mongoose.isValidObjectId(trimmed)) {
    return User.find({ _id: trimmed, role: "user", is_deleted: { $ne: true } })
      .select("_id first_name last_name email avatar coins")
      .limit(1);
  }

  const terms = trimmed.split(/\s+/).filter(Boolean);
  const termFilters = terms.map((term) => {
    const regex = new RegExp(escapeRegExp(term), "i");

    return {
      $or: [
        { first_name: regex },
        { last_name: regex },
        { email: regex },
      ],
    };
  });

  return User.find({
    role: "user",
    is_deleted: { $ne: true },
    ...(termFilters.length > 1 ? { $and: termFilters } : termFilters[0]),
  })
    .select("_id first_name last_name email avatar coins")
    .sort({ updatedAt: -1 })
    .limit(20);
};

exports.getSuspiciousActivity = asyncHandler(async (req, res) => {
  const source = typeof req.query.source === "string" ? req.query.source.trim() : "";
  const severity = typeof req.query.severity === "string" ? req.query.severity.trim() : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (source && source !== "all" && !SUSPICIOUS_SOURCE_TYPES.includes(source)) {
    return res.status(400).json({ message: "Invalid suspicious activity source filter" });
  }

  if (severity && severity !== "all" && !SUSPICIOUS_SEVERITIES.includes(severity)) {
    return res.status(400).json({ message: "Invalid suspicious activity severity filter" });
  }

  let activities = (await Promise.all([
    buildUserReportSuspiciousActivities(),
    buildProductReportSuspiciousActivities(),
    buildDisputeSuspiciousActivities(),
    buildCoinAdjustmentSuspiciousActivities(),
    buildReportSpamSuspiciousActivities(),
  ])).flat();

  if (source && source !== "all") {
    activities = activities.filter((activity) => activity.source === source);
  }

  if (severity && severity !== "all") {
    activities = activities.filter((activity) => activity.severity === severity);
  }

  if (q) {
    activities = activities.filter((activity) => suspiciousActivityMatchesSearch(activity, q));
  }

  activities.sort((a, b) => {
    const severityDelta = (SUSPICIOUS_SEVERITY_RANK[b.severity] || 0) - (SUSPICIOUS_SEVERITY_RANK[a.severity] || 0);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return new Date(b.latest_at || 0).getTime() - new Date(a.latest_at || 0).getTime();
  });

  return res.json({
    count: activities.length,
    activities,
    summary: summarizeSuspiciousActivities(activities),
    detection_rules: {
      user_reports: `At least ${SUSPICIOUS_REPORT_THRESHOLD} reports against the same user`,
      product_reports: `At least ${SUSPICIOUS_REPORT_THRESHOLD} reports against the same product`,
      excessive_disputes: `At least ${SUSPICIOUS_DISPUTE_THRESHOLD} currently disputed swaps involving the same user`,
      coin_adjustments: `At least ${SUSPICIOUS_ADMIN_ADJUSTMENT_THRESHOLD} admin coin adjustments for the same user in ${SUSPICIOUS_ADMIN_ADJUSTMENT_WINDOW_DAYS} days`,
      report_spam: `At least ${SUSPICIOUS_REPORT_SPAM_THRESHOLD} reports submitted by the same user in ${SUSPICIOUS_REPORT_SPAM_WINDOW_DAYS} days`,
      blocked_account_attempts: "Not tracked by the current data model",
      failed_payment_attempts: "Not tracked by the current data model",
    },
  });
});

const loadReviewableSwap = async (id, res) => {
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ message: "Swap request not found" });
    return null;
  }

  const swap = await SwapRequest.findById(id);

  if (!swap) {
    res.status(404).json({ message: "Swap request not found" });
    return null;
  }

  if (swap.status !== "under_review") {
    res.status(400).json({ message: "Swap must be under review" });
    return null;
  }

  return swap;
};

const cancelSwapByAdmin = async ({ swap, adminId, adminNotes }) => {
  const paymentSummary = await getCompletedServiceFeePaymentSummary(swap);

  swap.status = "cancelled";
  swap.admin_notes = adminNotes;
  swap.admin_reviewed_by = adminId;
  swap.admin_reviewed_at = new Date();
  await swap.save();

  const expiredTransactions = await expirePendingServiceFeeTransactions(swap, {
    actor: "admin",
    actorId: adminId,
    reason: "Pending service fee checkout expired because the swap was cancelled by an admin.",
  });

  const refundResult = await refundCompensationCoins(swap);

  if (refundResult.moved) {
    await createSwapTimelineEvent({
      swap,
      event: "compensation_refunded",
      description: `${refundResult.amount} held compensation coins refunded after swap cancellation.`,
      actor: "system",
    });

    await createNotification({
      user: refundResult.payer,
      type: "system",
      title: "Held coins refunded",
      body: `${refundResult.amount} held compensation coins were refunded after swap cancellation.`,
      related_swap: swap._id,
    });
  }

  if (swap.exchange_method === "delivery") {
    await createSwapTimelineEvent({
      swap,
      event: "delivery_cancelled",
      description: "Platform delivery cancelled with the swap.",
      actor: "admin",
      actor_id: adminId,
    });

    await notifySwapParticipants({
      swap,
      type: "delivery",
      title: "Delivery cancelled",
      body: "Platform delivery was cancelled with this swap.",
    });
  }

  await notifySwapParticipants({
    swap,
    type: "system",
    title: "Swap cancelled",
    body: "An admin cancelled this swap.",
  });

  await createSwapTimelineEvent({
    swap,
    event: "cancelled",
    description: adminNotes
      ? `Swap cancelled by admin. ${adminNotes}`
      : "Swap cancelled by admin.",
    actor: "admin",
    actor_id: adminId,
  });

  return {
    expiredTransactions,
    paymentSummary,
    serviceFeeReviewRequired: paymentSummary.anyPaid,
  };
};

exports.getAdminStats = asyncHandler(async (req, res) => {
  const productStatuses = ["available", "reserved", "swapped", "inactive", "rejected"];
  const reportStatuses = ["open", "under_review", "resolved", "dismissed"];
  const contactStatuses = ["open", "in_review", "resolved", "dismissed"];
  const deliveryStatuses = [
    DELIVERY_STATUS.PENDING_PICKUP,
    DELIVERY_STATUS.PICKED_UP,
    DELIVERY_STATUS.IN_TRANSIT,
    DELIVERY_STATUS.DELIVERED_TO_RECEIVER,
    DELIVERY_STATUS.DELIVERY_COMPLETED,
  ];

  const [
    totalUsers,
    deletedUsers,
    adminUsers,
    totalProducts,
    productStatusCounts,
    categoryBreakdown,
    featuredProducts,
    reportedProductIds,
    totalSwaps,
    swapStatusCounts,
    reportStatusCounts,
    totalReports,
    contactStatusCounts,
    totalContactMessages,
    totalTransactions,
    transactionDirectionTotals,
    heldCoinsTotal,
    adminAdjustmentsCount,
    deliveryStatusCounts,
    latestSwaps,
    latestReports,
    latestSupportMessages,
    latestTransactions,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ is_deleted: true }),
    User.countDocuments({ role: "admin", is_deleted: { $ne: true } }),
    Product.countDocuments(),
    countByValue(Product, "status", productStatuses),
    countProductCategories(),
    Product.countDocuments({ is_featured: true }),
    Report.distinct("target_id", { target_type: "product" }),
    SwapRequest.countDocuments(),
    countByValue(SwapRequest, "status", SWAP_STATUSES),
    countByValue(Report, "status", reportStatuses),
    Report.countDocuments(),
    countByValue(ContactMessage, "status", contactStatuses),
    ContactMessage.countDocuments(),
    Transaction.countDocuments(),
    sumTransactionsByDirection(),
    sumUserWalletField("held_coins"),
    Transaction.countDocuments({ type: "admin_adjustment" }),
    countByValue(
      SwapRequest,
      "delivery_details.delivery_status",
      deliveryStatuses,
      { exchange_method: "delivery" }
    ),
    populateSwap(SwapRequest.find({}).sort({ updatedAt: -1 }).limit(6)),
    populateReport(Report.find({}).sort({ createdAt: -1 }).limit(6)),
    populateContactMessage(ContactMessage.find({}).sort({ createdAt: -1 }).limit(6)),
    Transaction.find({})
      .populate("user", "_id first_name last_name email avatar")
      .populate("swap", "_id status")
      .populate("product", "_id title images")
      .sort({ createdAt: -1 })
      .limit(6),
  ]);

  const nonDeletedUsers = Math.max(0, totalUsers - deletedUsers);
  const openReports = reportStatusCounts.open || 0;
  const inReviewReports = reportStatusCounts.under_review || 0;
  const resolvedReports = reportStatusCounts.resolved || 0;
  const openContactMessages = contactStatusCounts.open || 0;
  const inReviewContactMessages = contactStatusCounts.in_review || 0;
  const completedSwaps = swapStatusCounts.completed || 0;
  const underReviewSwaps = swapStatusCounts.under_review || 0;

  return res.json({
    users: totalUsers,
    total_users: totalUsers,
    active_users: null,
    active_users_available: false,
    non_deleted_users: nonDeletedUsers,
    deleted_users: deletedUsers,
    admin_users: adminUsers,
    regular_users: Math.max(0, nonDeletedUsers - adminUsers),

    products: totalProducts,
    total_products: totalProducts,
    product_statuses: productStatusCounts,
    category_breakdown: categoryBreakdown,
    category_counts: Object.fromEntries(
      categoryBreakdown.map((item) => [item.category, item.count])
    ),
    available_products: productStatusCounts.available || 0,
    reserved_products: productStatusCounts.reserved || 0,
    swapped_products: productStatusCounts.swapped || 0,
    inactive_products: productStatusCounts.inactive || 0,
    rejected_products: productStatusCounts.rejected || 0,
    featured_products: featuredProducts,
    reported_products: reportedProductIds.length,

    swaps: totalSwaps,
    total_swaps: totalSwaps,
    swap_statuses: swapStatusCounts,
    pending_swaps: swapStatusCounts.pending || 0,
    in_discussion_swaps: swapStatusCounts.in_discussion || 0,
    under_review_swaps: underReviewSwaps,
    pending_approvals: underReviewSwaps,
    approved_swaps: swapStatusCounts.approved || 0,
    payment_pending_swaps: swapStatusCounts.payment_pending || 0,
    exchange_setup_swaps: swapStatusCounts.exchange_setup || 0,
    in_progress_swaps: swapStatusCounts.in_progress || 0,
    completed_swaps: completedSwaps,
    disputed_swaps: swapStatusCounts.disputed || 0,
    cancelled_swaps: swapStatusCounts.cancelled || 0,
    rejected_swaps: swapStatusCounts.rejected || 0,
    accepted_swaps: swapStatusCounts.in_discussion || 0,

    reports: totalReports,
    total_reports: totalReports,
    report_statuses: reportStatusCounts,
    open_reports: openReports,
    in_review_reports: inReviewReports,
    resolved_reports: resolvedReports,
    dismissed_reports: reportStatusCounts.dismissed || 0,
    reports_needing_review: openReports + inReviewReports,

    contact_messages: totalContactMessages,
    total_contact_messages: totalContactMessages,
    support_statuses: contactStatusCounts,
    open_contact_messages: openContactMessages,
    in_review_contact_messages: inReviewContactMessages,
    resolved_contact_messages: contactStatusCounts.resolved || 0,
    dismissed_contact_messages: contactStatusCounts.dismissed || 0,
    support_messages_needing_review: openContactMessages + inReviewContactMessages,

    transactions: totalTransactions,
    total_coin_transactions: totalTransactions,
    transaction_direction_totals: transactionDirectionTotals,
    total_coins_credited: transactionDirectionTotals.credit || 0,
    total_coins_debited: transactionDirectionTotals.debit || 0,
    held_coins_total: heldCoinsTotal,
    admin_adjustments_count: adminAdjustmentsCount,

    delivery_statuses: deliveryStatusCounts,
    pending_pickup_deliveries: deliveryStatusCounts[DELIVERY_STATUS.PENDING_PICKUP] || 0,
    picked_up_deliveries: deliveryStatusCounts[DELIVERY_STATUS.PICKED_UP] || 0,
    in_transit_deliveries: deliveryStatusCounts[DELIVERY_STATUS.IN_TRANSIT] || 0,
    delivered_to_receiver_deliveries: deliveryStatusCounts[DELIVERY_STATUS.DELIVERED_TO_RECEIVER] || 0,
    delivery_completed_deliveries: deliveryStatusCounts[DELIVERY_STATUS.DELIVERY_COMPLETED] || 0,

    latest_swaps: latestSwaps.map(serializeDashboardSwap).filter(Boolean),
    latest_reports: latestReports.map(serializeDashboardReport).filter(Boolean),
    latest_support_messages: latestSupportMessages.map(serializeDashboardContactMessage).filter(Boolean),
    latest_transactions: latestTransactions.map(serializeAdminTransaction).filter(Boolean),
  });
});

exports.getAdminUsers = asyncHandler(async (req, res) => {
  const page = clampPaginationNumber(req.query.page, 1, 100000);
  const limit = clampPaginationNumber(req.query.limit, 25, 100);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const role = typeof req.query.role === "string" ? req.query.role.trim() : "";
  const verification = typeof req.query.verification === "string" ? req.query.verification.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const trust = typeof req.query.trust === "string" ? req.query.trust.trim() : "";
  const reported = typeof req.query.reported === "string" ? req.query.reported.trim() : "";
  const includeAdmins = req.query.includeAdmins === "true";

  const filter = includeAdmins ? {} : { role: "user" };
  const addRequiredFilter = (condition) => {
    filter.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), condition];
  };

  if (role) {
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role filter" });
    }

    if (role === "admin" && !includeAdmins) {
      return res.status(400).json({
        message: "Admin accounts are not available in normal user management",
      });
    }

    filter.role = role;
  }

  if (status) {
    if (!["active", "deleted", "pending_verification", "unverified", "all"].includes(status)) {
      return res.status(400).json({ message: "Invalid account status filter" });
    }

    if (status === "active") {
      filter.is_deleted = { $ne: true };
      addRequiredFilter({ isEmailVerified: true });
    } else if (status === "deleted") {
      filter.is_deleted = true;
    } else if (status === "pending_verification" || status === "unverified") {
      filter.is_deleted = { $ne: true };
      addRequiredFilter({ isEmailVerified: { $ne: true } });
    }
  }

  if (verification) {
    if (!["verified", "unverified", "email_verified", "email_unverified", "phone_verified", "phone_unverified"].includes(verification)) {
      return res.status(400).json({ message: "Invalid verification filter" });
    }

    if (verification === "verified") {
      addRequiredFilter({ isEmailVerified: true });
      addRequiredFilter({ isPhoneVerified: true });
    } else if (verification === "unverified") {
      addRequiredFilter({
        $or: [
          { isEmailVerified: { $ne: true } },
          { isPhoneVerified: { $ne: true } },
        ],
      });
    } else if (verification === "email_verified") {
      addRequiredFilter({ isEmailVerified: true });
    } else if (verification === "email_unverified") {
      addRequiredFilter({ isEmailVerified: { $ne: true } });
    } else if (verification === "phone_verified") {
      addRequiredFilter({ isPhoneVerified: true });
    } else if (verification === "phone_unverified") {
      addRequiredFilter({ isPhoneVerified: { $ne: true } });
    }
  }

  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    const searchFilter = {
      $or: [
        { first_name: regex },
        { last_name: regex },
        { email: regex },
        { city: regex },
      ],
    };

    addRequiredFilter(searchFilter);
  }

  if (reported) {
    if (!["true", "false"].includes(reported)) {
      return res.status(400).json({ message: "Invalid reported filter" });
    }

    const reportedUserIds = await Report.distinct("target_id", { target_type: "user" });

    if (reported === "true") {
      filter._id = { $in: reportedUserIds };
    } else {
      filter._id = { $nin: reportedUserIds };
    }
  }

  const users = await User.find(filter)
    .select("_id first_name last_name email avatar phone bio country city area street_address role isEmailVerified isPhoneVerified rating rating_count coins held_coins is_deleted deleted_at createdAt updatedAt")
    .sort({ createdAt: -1 });

  const metricsMap = await getAdminUserMetricsMap(users);
  let serializedUsers = users
    .map((user) => serializeAdminUser(user, metricsMap.get(toIdString(user._id)) || {}))
    .filter(Boolean);

  if (trust) {
    if (!["all", "trusted", "new", "risky", "low"].includes(trust)) {
      return res.status(400).json({ message: "Invalid trust filter" });
    }

    if (trust !== "all") {
      serializedUsers = serializedUsers.filter((user) =>
        trust === "low"
          ? user.role !== "admin" && Number(user.trust_score) < 35
          : user.trust_level === trust
      );
    }
  }

  const total = serializedUsers.length;
  const start = (page - 1) * limit;
  const paginatedUsers = serializedUsers.slice(start, start + limit);

  return res.json({
    count: paginatedUsers.length,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    users: paginatedUsers,
    summary: {
      total,
      active: serializedUsers.filter((user) => user.account_status === "active").length,
      deleted: serializedUsers.filter((user) => user.account_status === "deleted").length,
      unverified: serializedUsers.filter((user) => user.account_status === "pending_verification").length,
      reported: serializedUsers.filter((user) => user.report_count > 0).length,
      low_trust: serializedUsers.filter((user) =>
        user.role !== "admin" &&
        Number(user.trust_score) < 35 &&
        user.account_status !== "deleted"
      ).length,
    },
  });
});

exports.removeAdminUserFromPlatform = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";

  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ message: "User not found" });
  }

  if (reason.length < 5) {
    return res.status(400).json({ message: "Reason must be at least 5 characters" });
  }

  if (String(req.userId) === String(id)) {
    return res.status(400).json({ message: "Admins cannot remove their own account from the platform" });
  }

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.role === "admin") {
    return res.status(400).json({ message: "Admin accounts cannot be removed from normal user management" });
  }

  if (user.is_deleted) {
    const metricsMap = await getAdminUserMetricsMap([user]);
    return res.json({
      message: "User is already removed from the platform",
      user: serializeAdminUser(user, metricsMap.get(toIdString(user._id)) || {}),
    });
  }

  const activeSwap = await SwapRequest.exists({
    status: { $in: ACTIVE_SWAP_STATUSES_FOR_USER_DELETE },
    $or: [{ requester: user._id }, { receiver: user._id }],
  });

  if (activeSwap) {
    return res.status(400).json({ message: "Cannot remove a user with active swaps" });
  }

  const now = new Date();
  const anonymousId = String(user._id).slice(-8);
  const originalEmail = user.email;

  await blockEmailForPlatform({
    email: originalEmail,
    reason,
    blockedBy: req.userId,
    blockedAt: now,
  });

  user.first_name = "Deleted";
  user.last_name = "User";
  user.email = `deleted-${user._id}-${Date.now()}@deleted.swap-save.local`;
  user.password = await bcrypt.hash(new mongoose.Types.ObjectId().toString(), 10);
  user.phone = "";
  user.avatar = "";
  user.bio = "";
  user.address = "";
  user.country = "";
  user.city = "";
  user.area = "";
  user.street_address = "";
  user.saved_products = [];
  user.isEmailVerified = false;
  user.isPhoneVerified = false;
  user.emailVerificationToken = null;
  user.emailVerificationExpires = null;
  user.passwordResetToken = null;
  user.passwordResetExpires = null;
  user.notification_preferences = {
    swap_requests_enabled: false,
    new_messages_enabled: false,
    admin_decisions_enabled: false,
    new_ratings_enabled: false,
    promotions_enabled: false,
    weekly_digest_enabled: false,
  };
  user.is_deleted = true;
  user.deleted_at = now;

  await user.save();

  const ownedProductIds = await Product.distinct("_id", { owner_id: user._id });

  await Promise.all([
    Product.updateMany(
      { owner_id: user._id, status: { $nin: ["swapped"] } },
      {
        $set: {
          status: "inactive",
          is_featured: false,
        },
        $unset: {
          featured_until: "",
          priority_boosted_at: "",
          priority_boosted_until: "",
        },
      }
    ),
    User.updateMany(
      { saved_products: { $in: ownedProductIds } },
      { $pull: { saved_products: { $in: ownedProductIds } } }
    ),
  ]);

  const metricsMap = await getAdminUserMetricsMap([user]);

  return res.json({
    message: `User ${anonymousId} removed from platform`,
    user: serializeAdminUser(user, metricsMap.get(toIdString(user._id)) || {}),
  });
});

exports.getAdminProducts = asyncHandler(async (req, res) => {
  const page = clampPaginationNumber(req.query.page, 1, 100000);
  const limit = clampPaginationNumber(req.query.limit, 25, 100);
  const skip = (page - 1) * limit;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const featured = typeof req.query.featured === "string" ? req.query.featured.trim() : "";
  const reported = typeof req.query.reported === "string" ? req.query.reported.trim() : "";

  const filter = {};

  if (status) {
    if (!PRODUCT_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid product status filter" });
    }

    filter.status = status;
  }

  if (category) {
    filter.category = category;
  }

  if (featured) {
    if (!["true", "false"].includes(featured)) {
      return res.status(400).json({ message: "Invalid featured filter" });
    }

    filter.is_featured = featured === "true";
  }

  if (reported) {
    if (!["true", "false"].includes(reported)) {
      return res.status(400).json({ message: "Invalid reported filter" });
    }

    const reportedProductIds = await Report.distinct("target_id", { target_type: "product" });
    filter._id = reported === "true"
      ? { $in: reportedProductIds }
      : { $nin: reportedProductIds };
  }

  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    const ownerIds = await User.find({
      $or: [
        { first_name: regex },
        { last_name: regex },
        { email: regex },
      ],
    }).distinct("_id");

    filter.$or = [
      { title: regex },
      { category: regex },
      { condition: regex },
      { owner_id: { $in: ownerIds } },
    ];
  }

  const [total, products, categories] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .populate("owner_id", "_id first_name last_name email avatar is_deleted")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Product.distinct("category"),
  ]);

  const reportCounts = await countReportsByTarget(
    "product",
    products.map((product) => product._id)
  );

  const serializedProducts = products
    .map((product) => serializeAdminProduct(product, reportCounts.get(toIdString(product._id)) || 0))
    .filter(Boolean);

  return res.json({
    count: serializedProducts.length,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    categories: categories.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
    products: serializedProducts,
    summary: {
      total,
      featured: await Product.countDocuments({ ...filter, is_featured: true }),
      reported: reported === "true" ? total : (await Report.distinct("target_id", { target_type: "product" })).length,
      inactive: await Product.countDocuments({ ...filter, status: "inactive" }),
      rejected: await Product.countDocuments({ ...filter, status: "rejected" }),
    },
  });
});

exports.updateAdminProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const product = await Product.findById(id);

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const updates = {};
  const unset = {};
  const body = req.body || {};

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = typeof body.status === "string" ? body.status.trim() : "";

    if (!["available", "inactive", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Product status can only be set to available, inactive, or rejected here" });
    }

    if (["reserved", "swapped"].includes(product.status)) {
      return res.status(400).json({ message: "Reserved or swapped products cannot be moderated from this page" });
    }

    updates.status = status;

    if (status !== "available") {
      updates.is_featured = false;
      unset.featured_until = "";
      unset.priority_boosted_at = "";
      unset.priority_boosted_until = "";
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "is_featured")) {
    const isFeatured = body.is_featured === true || body.isFeatured === true;

    if (isFeatured && product.status !== "available" && updates.status !== "available") {
      return res.status(400).json({ message: "Only available products can be featured" });
    }

    updates.is_featured = isFeatured;

    if (isFeatured) {
      const featuredUntil = new Date();
      featuredUntil.setDate(featuredUntil.getDate() + 30);
      updates.featured_until = featuredUntil;
    } else {
      unset.featured_until = "";
      unset.priority_boosted_at = "";
      unset.priority_boosted_until = "";
    }
  }

  if (Object.keys(updates).length === 0 && Object.keys(unset).length === 0) {
    return res.status(400).json({ message: "No supported product updates provided" });
  }

  const update = {};

  if (Object.keys(updates).length > 0) {
    update.$set = updates;
  }

  if (Object.keys(unset).length > 0) {
    update.$unset = unset;
  }

  const updatedProduct = await Product.findByIdAndUpdate(id, update, { returnDocument: "after" })
    .populate("owner_id", "_id first_name last_name email avatar is_deleted");

  const reportCounts = await countReportsByTarget("product", [updatedProduct._id]);

  return res.json({
    message: "Product updated",
    product: serializeAdminProduct(updatedProduct, reportCounts.get(toIdString(updatedProduct._id)) || 0),
  });
});

exports.getAdminTransactions = asyncHandler(async (req, res) => {
  const filter = {};
  const page = clampPaginationNumber(req.query.page, 1, 100000);
  const limit = clampPaginationNumber(req.query.limit, 25, 100);
  const skip = (page - 1) * limit;

  const type = typeof req.query.type === "string" ? req.query.type.trim() : "";
  const direction = typeof req.query.direction === "string" ? req.query.direction.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const userQuery = typeof req.query.user === "string" ? req.query.user.trim() : "";
  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

  if (type) {
    if (!TRANSACTION_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid transaction type" });
    }

    filter.type = type;
  }

  if (direction) {
    if (!TRANSACTION_DIRECTIONS.includes(direction)) {
      return res.status(400).json({ message: "Invalid transaction direction" });
    }

    filter.direction = direction;
  }

  if (status) {
    if (!TRANSACTION_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid transaction status" });
    }

    filter.status = status;
  }

  let userCandidates = [];
  if (userQuery) {
    userCandidates = await findTransactionUserCandidates(userQuery);

    if (userCandidates.length === 0) {
      return res.json({
        count: 0,
        total: 0,
        page,
        limit,
        total_pages: 0,
        transactions: [],
        users: [],
      });
    }

    filter.user = { $in: userCandidates.map((user) => user._id) };
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};

    if (dateFrom) {
      const from = new Date(dateFrom);

      if (Number.isNaN(from.getTime())) {
        return res.status(400).json({ message: "Invalid dateFrom" });
      }

      filter.createdAt.$gte = from;
    }

    if (dateTo) {
      const to = new Date(dateTo);

      if (Number.isNaN(to.getTime())) {
        return res.status(400).json({ message: "Invalid dateTo" });
      }

      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  const [total, transactions] = await Promise.all([
    Transaction.countDocuments(filter),
    Transaction.find(filter)
      .populate("user", "_id first_name last_name email avatar")
      .populate("swap", "_id status")
      .populate("product", "_id title images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return res.json({
    count: transactions.length,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    transactions: transactions.map(serializeAdminTransaction).filter(Boolean),
    users: userCandidates.map((user) => serializeBasicUser(user, { includeWallet: true })).filter(Boolean),
  });
});

exports.adjustUserCoins = asyncHandler(async (req, res) => {
  const userId = typeof req.body.userId === "string" ? req.body.userId.trim() : "";
  const direction = typeof req.body.direction === "string" ? req.body.direction.trim() : "";
  const amount = Number(req.body.amount);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  if (!ADJUSTMENT_DIRECTIONS.includes(direction)) {
    return res.status(400).json({ message: "direction must be credit or debit" });
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ message: "amount must be a positive integer" });
  }

  if (reason.length < 5) {
    return res.status(400).json({ message: "reason must be at least 5 characters" });
  }

  const user = await User.findOne({ _id: userId, is_deleted: { $ne: true } });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (String(req.userId) === String(user._id)) {
    return res.status(400).json({ message: "Admins cannot adjust their own coin balance" });
  }

  if (user.role === "admin") {
    return res.status(400).json({ message: "Admin accounts cannot receive coin adjustments" });
  }

  if (direction === "debit" && Number(user.coins || 0) < amount) {
    return res.status(400).json({ message: "Debit cannot make user balance negative" });
  }

  const walletIncrement = direction === "credit"
    ? { coins: amount, total_coins_earned: amount }
    : { coins: -amount, total_coins_spent: amount };

  const updateFilter = {
    _id: user._id,
    role: "user",
    is_deleted: { $ne: true },
    ...(direction === "debit" ? { coins: { $gte: amount } } : {}),
  };

  const updatedUser = await User.findOneAndUpdate(
    updateFilter,
    { $inc: walletIncrement },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    return res.status(400).json({ message: "Debit cannot make user balance negative" });
  }

  let transaction;

  try {
    const admin = await User.findById(req.userId).select("_id first_name last_name email");

    transaction = await Transaction.create({
      user: updatedUser._id,
      type: "admin_adjustment",
      direction,
      amount,
      currency: "coins",
      status: "completed",
      description: `Admin adjustment: ${reason}`,
      metadata: {
        admin: admin
          ? {
              id: String(admin._id),
              name: `${admin.first_name || ""} ${admin.last_name || ""}`.trim(),
              email: admin.email || "",
            }
          : { id: String(req.userId) },
        admin_id: String(req.userId),
        reason,
      },
    });
  } catch (error) {
    const rollbackIncrement = direction === "credit"
      ? { coins: -amount, total_coins_earned: -amount }
      : { coins: amount, total_coins_spent: -amount };

    await User.updateOne({ _id: updatedUser._id }, { $inc: rollbackIncrement });
    throw error;
  }

  await createNotification({
    user: updatedUser._id,
    type: "payment",
    title: "Wallet adjusted by admin",
    body: `Admin ${direction === "credit" ? "credited" : "debited"} ${amount} coins. Reason: ${reason}`,
    target_type: "wallet",
    target_id: transaction._id,
    target_url: "/user/coins",
    bypass_preferences: true,
  });

  const populatedTransaction = await Transaction.findById(transaction._id)
    .populate("user", "_id first_name last_name email avatar")
    .populate("swap", "_id status")
    .populate("product", "_id title images");

  return res.status(201).json({
    message: "Coin adjustment recorded",
    user: serializeBasicUser(updatedUser, { includeWallet: true }),
    wallet: await getWalletSummary(updatedUser._id),
    transaction: serializeAdminTransaction(populatedTransaction),
  });
});

exports.getAdminSwaps = asyncHandler(async (req, res) => {
  const filter = {};
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const exchangeMethod =
    typeof req.query.exchange_method === "string"
      ? req.query.exchange_method.trim()
      : typeof req.query.exchangeMethod === "string"
        ? req.query.exchangeMethod.trim()
        : "";
  const search =
    typeof req.query.q === "string"
      ? req.query.q.trim()
      : typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";
  const page = clampPaginationNumber(req.query.page, 1, 100000);
  const limit = clampPaginationNumber(req.query.limit, 50, 100);
  const skip = (page - 1) * limit;

  if (status) {
    if (!SWAP_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid swap status" });
    }

    filter.status = status;
  }

  if (exchangeMethod) {
    if (!["meetup", "delivery"].includes(exchangeMethod)) {
      return res.status(400).json({ message: "Invalid exchange method" });
    }

    filter.exchange_method = exchangeMethod;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search), "i");
    const [matchingUserIds, matchingProductIds] = await Promise.all([
      User.find({
        $or: [
          { first_name: regex },
          { last_name: regex },
          { email: regex },
        ],
      }).distinct("_id"),
      Product.find({
        $or: [
          { title: regex },
          { category: regex },
        ],
      }).distinct("_id"),
    ]);

    filter.$or = [
      ...(mongoose.isValidObjectId(search) ? [{ _id: search }] : []),
      { requester: { $in: matchingUserIds } },
      { receiver: { $in: matchingUserIds } },
      { product_offered: { $in: matchingProductIds } },
      { product_requested: { $in: matchingProductIds } },
    ];
  }

  const [total, swaps] = await Promise.all([
    SwapRequest.countDocuments(filter),
    populateSwap(SwapRequest.find(filter))
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);
  const swapsWithReportCounts = await attachReportCountsToSwaps(swaps);

  return res.json({
    count: swaps.length,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    swaps: swapsWithReportCounts
  });
});

exports.getAdminSwapById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await populateSwap(SwapRequest.findById(req.params.id));

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const [swapWithTimeline, reports] = await Promise.all([
    addTimelineToSwap(swap),
    populateReport(
      Report.find({
        $or: [
          { swap: swap._id },
          { target_type: "swap", target_id: swap._id },
        ],
      })
    ).sort({ createdAt: -1 }),
  ]);

  const [swapWithCounts] = await attachReportCountsToSwaps([swapWithTimeline]);

  return res.json({
    swap: {
      ...swapWithCounts,
      timeline: swapWithTimeline.timeline || [],
    },
    reports,
  });
});

exports.getAdminSwapMessages = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const messages = await Message.find({ swap: swap._id })
    .populate("sender", "_id first_name last_name avatar email")
    .sort({ createdAt: 1 });

  return res.json({ messages });
});

exports.getReports = asyncHandler(async (req, res) => {
  const filter = {};
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const targetType =
    typeof req.query.target_type === "string"
      ? req.query.target_type.trim()
      : typeof req.query.targetType === "string"
        ? req.query.targetType.trim()
        : "";
  const reason = typeof req.query.reason === "string" ? req.query.reason.trim() : "";
  const search =
    typeof req.query.q === "string"
      ? req.query.q.trim()
      : typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";
  const page = clampPaginationNumber(req.query.page, 1, 100000);
  const limit = clampPaginationNumber(req.query.limit, 50, 100);

  if (status) {
    if (!REPORT_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid report status" });
    }

    filter.status = status;
  }

  if (targetType) {
    if (!REPORT_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ message: "Invalid report target type" });
    }

    filter.target_type = targetType;
  }

  if (reason) {
    filter.reason = new RegExp(escapeRegExp(reason), "i");
  }

  const rawReports = await populateReport(Report.find(filter)).sort({ createdAt: -1 });
  const enrichedReports = await enrichAdminReports(rawReports);
  const filteredReports = search
    ? enrichedReports.filter((report) => reportMatchesSearch(report, search))
    : enrichedReports;
  const total = filteredReports.length;
  const reports = filteredReports.slice((page - 1) * limit, page * limit);

  return res.json({
    count: reports.length,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    reports,
  });
});

exports.getContactMessages = asyncHandler(async (req, res) => {
  const filter = {};
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const inquiryType =
    typeof req.query.inquiry_type === "string"
      ? req.query.inquiry_type.trim()
      : typeof req.query.inquiryType === "string"
        ? req.query.inquiryType.trim()
        : typeof req.query.type === "string"
          ? req.query.type.trim()
          : "";

  if (status) {
    if (!CONTACT_MESSAGE_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid contact message status" });
    }

    filter.status = status;
  }

  if (inquiryType) {
    if (!CONTACT_MESSAGE_TYPES.includes(inquiryType)) {
      return res.status(400).json({ message: "Invalid contact message inquiry type" });
    }

    filter.inquiry_type = inquiryType;
  }

  const messages = await populateContactMessage(ContactMessage.find(filter)).sort({ createdAt: -1 });

  return res.json({
    count: messages.length,
    messages,
  });
});

exports.updateContactMessageStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Contact message not found" });
  }

  const replyPayload = getOptionalContactUserReply(req.body || {});
  const status = typeof req.body.status === "string" ? req.body.status.trim() : "";
  const adminNotes =
    typeof req.body.admin_notes === "string"
      ? req.body.admin_notes.trim()
      : typeof req.body.adminNotes === "string"
        ? req.body.adminNotes.trim()
        : undefined;

  if (replyPayload.error) {
    return res.status(400).json({ message: replyPayload.error });
  }

  if (status && !CONTACT_MESSAGE_STATUSES.includes(status)) {
    return res.status(400).json({
      message: "status must be open, in_review, resolved, or dismissed",
    });
  }

  if (!status && adminNotes === undefined && !replyPayload.provided) {
    return res.status(400).json({
      message: "status, admin_notes, or user_reply is required",
    });
  }

  const contactMessage = await ContactMessage.findById(req.params.id);

  if (!contactMessage) {
    return res.status(404).json({ message: "Contact message not found" });
  }

  if (status) {
    contactMessage.status = status;

    if (status === "resolved") {
      contactMessage.resolved_at = new Date();
      contactMessage.resolved_by = req.userId;
    }
  }

  if (adminNotes !== undefined) {
    contactMessage.admin_notes = adminNotes;
  }

  if (replyPayload.provided) {
    contactMessage.user_reply = replyPayload.value;
    contactMessage.replied_at = new Date();
    contactMessage.replied_by = req.userId;
  }

  await contactMessage.save();

  const replyDelivery = replyPayload.provided
    ? {
        notification_sent: false,
        email_sent: false,
        email_skipped: false,
      }
    : undefined;
  const warnings = [];

  if (replyPayload.provided) {
    if (contactMessage.user_id) {
      const notification = await createNotification({
        user: contactMessage.user_id,
        type: "system",
        title: "Support request updated",
        body: `Swap & Save support replied to your request: ${contactMessage.subject}`,
        target_type: "support",
        target_id: contactMessage._id,
        target_url: "/user/notifications",
      });

      replyDelivery.notification_sent = Boolean(notification);
    }

    try {
      const emailResult = await sendSupportReplyEmail({
        to: contactMessage.email,
        name: contactMessage.full_name,
        ticketSubject: contactMessage.subject,
        reply: replyPayload.value,
      });

      replyDelivery.email_sent = emailResult?.sent === true;
      replyDelivery.email_skipped = emailResult?.skipped === true;
    } catch (error) {
      console.warn(
        `[support] Failed to send support reply email for contact message ${contactMessage._id}: ${error.message}`
      );
      warnings.push("Support reply was saved, but the email could not be sent.");
    }
  }

  const populatedMessage = await populateContactMessage(ContactMessage.findById(contactMessage._id));

  const response = {
    message: "Contact message updated successfully",
    contact_message: populatedMessage,
  };

  if (replyDelivery) {
    response.reply_delivery = replyDelivery;
  }

  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return res.json(response);
});

exports.resolveReport = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Report not found" });
  }

  const report = await Report.findById(req.params.id);

  if (!report) {
    return res.status(404).json({ message: "Report not found" });
  }

  const resolutionAction = req.body.resolution_action || req.body.resolutionAction;
  const adminNotes =
    typeof req.body.admin_notes === "string"
      ? req.body.admin_notes.trim()
      : typeof req.body.adminNotes === "string"
        ? req.body.adminNotes.trim()
        : "";

  if (!REPORT_RESOLUTION_ACTIONS.includes(resolutionAction)) {
    return res.status(400).json({
      message: "resolution_action must be dismiss, resolve, cancel_swap, or continue_swap",
    });
  }

  if (CLOSED_REPORT_STATUSES.includes(report.status)) {
    return res.status(400).json({ message: "Report has already been resolved" });
  }

  const isSwapDispute = report.target_type === "swap";

  if (["cancel_swap", "continue_swap"].includes(resolutionAction) && !isSwapDispute) {
    return res.status(400).json({ message: "Swap lifecycle actions are only valid for swap disputes" });
  }

  if (resolutionAction === "resolve" && isSwapDispute) {
    return res.status(400).json({ message: "Use dismiss, continue_swap, or cancel_swap for swap disputes" });
  }

  if (["resolve", "cancel_swap", "continue_swap"].includes(resolutionAction) && !adminNotes) {
    return res.status(400).json({ message: "Admin notes are required for this resolution action" });
  }

  let swap = report.swap
    ? await SwapRequest.findById(report.swap)
    : isSwapDispute
      ? await SwapRequest.findById(report.target_id)
      : null;

  if (["cancel_swap", "continue_swap"].includes(resolutionAction) && !swap) {
    return res.status(400).json({ message: "A related swap is required for this resolution action" });
  }

  if (resolutionAction === "dismiss") {
    report.status = "dismissed";

    if (report.target_type === "swap" && swap && swap.status === "disputed") {
      if (!RESTORABLE_DISPUTE_STATUSES.includes(report.previous_swap_status)) {
        return res.status(400).json({
          message: "Previous swap status is missing or unsafe to restore. Cancel the swap instead.",
        });
      }

      swap.status = report.previous_swap_status;
      await swap.save();

      await notifySwapParticipants({
        swap,
        type: "system",
        title: "Dispute dismissed",
        body: "An admin dismissed the dispute and restored the swap.",
      });
    }
  }

  if (resolutionAction === "resolve") {
    report.status = "resolved";
  }

  if (resolutionAction === "cancel_swap") {
    report.status = "resolved";

    if (swap) {
      if (TERMINAL_SWAP_STATUSES.includes(swap.status)) {
        return res.status(400).json({ message: "This swap is already terminal and cannot be cancelled from this report" });
      }

      await cancelSwapByAdmin({
        swap,
        adminId: req.userId,
        adminNotes,
      });
    }
  }

  if (resolutionAction === "continue_swap") {
    report.status = "resolved";

    if (report.target_type !== "swap") {
      return res.status(400).json({ message: "Only swap disputes can continue a swap" });
    }

    if (swap && swap.status === "disputed") {
      if (!RESTORABLE_DISPUTE_STATUSES.includes(report.previous_swap_status)) {
        return res.status(400).json({
          message: "Previous swap status is missing or unsafe to restore. Cancel the swap or dismiss the report instead.",
        });
      }

      swap.status = report.previous_swap_status;
      await swap.save();

      await notifySwapParticipants({
        swap,
        type: "system",
        title: "Dispute resolved",
        body: "An admin resolved the dispute and the swap can continue.",
      });
    } else {
      return res.status(400).json({ message: "Only a currently disputed swap can be continued" });
    }
  }

  report.admin_notes = adminNotes;
  report.resolution_action = resolutionAction;
  report.resolved_by = req.userId;
  report.resolved_at = new Date();
  await report.save();

  if (swap) {
    await createSwapTimelineEvent({
      swap,
      event: isSwapDispute ? "dispute_resolved" : "report_resolved",
      description:
        resolutionAction === "dismiss"
          ? `${isSwapDispute ? "Dispute" : "Report"} dismissed by admin.`
          : adminNotes
            ? `${isSwapDispute ? "Dispute" : "Report"} resolved by admin. ${adminNotes}`
            : `${isSwapDispute ? "Dispute" : "Report"} resolved by admin.`,
      actor: "admin",
      actor_id: req.userId,
    });
  }

  const [populatedReport] = await enrichAdminReports([
    await populateReport(Report.findById(report._id)),
  ]);

  return res.json({
    message: "Report updated successfully",
    report: populatedReport,
  });
});

exports.updateDeliveryTracking = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const action = req.body.action;
  const trackingAction = DELIVERY_TRACKING_ACTIONS[action];

  if (!trackingAction) {
    return res.status(400).json({ message: "Invalid delivery tracking action" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.exchange_method !== "delivery") {
    return res.status(400).json({ message: "Swap is not using platform delivery" });
  }

  const existingDetails =
    swap.delivery_details && typeof swap.delivery_details.toObject === "function"
      ? swap.delivery_details.toObject()
      : swap.delivery_details || {};
  const tracking = normalizeDeliveryTrackingState(existingDetails);
  tracking[trackingAction.key] = true;
  const deliveryStatus = getDeliveryStatusFromTracking(tracking);
  const deliveryUpdate = getDeliveryUpdateCopy(deliveryStatus, trackingAction.description);

  swap.delivery_details = {
    ...existingDetails,
    fee_per_user: Number(existingDetails.fee_per_user) || 100,
    payment_method: "cash_to_courier",
    delivery_status: deliveryStatus,
    tracking,
  };
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: deliveryUpdate.event,
    description: deliveryUpdate.body,
    actor: "admin",
    actor_id: req.userId,
  });

  await notifySwapParticipants({
    swap,
    type: "delivery",
    title: deliveryUpdate.title,
    body: deliveryUpdate.body,
  });

  const populatedSwap = await populateSwap(SwapRequest.findById(swap._id));

  return res.json({
    message: "Delivery tracking updated",
    swap: await addTimelineToSwap(populatedSwap),
  });
});

exports.approveSwap = asyncHandler(async (req, res) => {
  const swap = await loadReviewableSwap(req.params.id, res);

  if (!swap) {
    return;
  }

  const productIds = [swap.product_offered, swap.product_requested];
  const productCount = await Product.countDocuments({ _id: { $in: productIds } });

  if (productCount !== productIds.length) {
    return res.status(404).json({ message: "Product not found for this swap" });
  }

  swap.status = "approved";
  swap.admin_notes = getAdminNote(req);
  swap.admin_reviewed_by = req.userId;
  swap.admin_reviewed_at = new Date();
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "admin_approved",
    description: swap.admin_notes
      ? `Swap approved by admin. ${swap.admin_notes}`
      : "Swap approved by admin.",
    actor: "admin",
    actor_id: req.userId,
  });

  await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { status: "reserved" } }
  );

  await notifySwapParticipants({
    swap,
    type: "swap-approved",
    title: "Swap approved",
    body: "Your swap has been approved by an admin."
  });

  const populatedSwap = await populateSwap(SwapRequest.findById(swap._id));

  return res.json({
    message: "Swap approved successfully",
    swap: await addTimelineToSwap(populatedSwap)
  });
});

exports.rejectSwap = asyncHandler(async (req, res) => {
  const swap = await loadReviewableSwap(req.params.id, res);

  if (!swap) {
    return;
  }

  const productIds = [swap.product_offered, swap.product_requested];

  swap.status = "rejected";
  swap.admin_notes = getAdminNote(req);
  swap.admin_reviewed_by = req.userId;
  swap.admin_reviewed_at = new Date();
  await swap.save();

  const refundResult = await refundCompensationCoins(swap);

  if (refundResult.moved) {
    await createSwapTimelineEvent({
      swap,
      event: "compensation_refunded",
      description: `${refundResult.amount} held compensation coins refunded after admin rejection.`,
      actor: "system",
    });

    await createNotification({
      user: refundResult.payer,
      type: "system",
      title: "Held coins refunded",
      body: `${refundResult.amount} held compensation coins were refunded after admin rejection.`,
      related_swap: swap._id,
    });
  }

  await createSwapTimelineEvent({
    swap,
    event: "admin_rejected",
    description: swap.admin_notes
      ? `Swap rejected by admin. ${swap.admin_notes}`
      : "Swap rejected by admin.",
    actor: "admin",
    actor_id: req.userId,
  });

  await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { status: "available" } }
  );

  await notifySwapParticipants({
    swap,
    type: "swap-rejected",
    title: "Swap rejected",
    body: "Your swap was rejected by an admin."
  });

  const populatedSwap = await populateSwap(SwapRequest.findById(swap._id));

  return res.json({
    message: "Swap rejected successfully",
    swap: await addTimelineToSwap(populatedSwap)
  });
});

exports.cancelSwap = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const adminNotes = getAdminNote(req);

  if (!adminNotes) {
    return res.status(400).json({ message: "Admin cancellation reason is required" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (!ADMIN_CANCELLABLE_SWAP_STATUSES.includes(swap.status)) {
    return res.status(409).json({
      message: "Only active non-terminal swaps can be cancelled by admin",
    });
  }

  const cancellationResult = await cancelSwapByAdmin({
    swap,
    adminId: req.userId,
    adminNotes,
  });

  const populatedSwap = await populateSwap(SwapRequest.findById(swap._id));

  return res.json({
    message: cancellationResult.serviceFeeReviewRequired
      ? "Swap cancelled successfully. Manual service fee review may be required."
      : "Swap cancelled successfully",
    service_fee_review_required: cancellationResult.serviceFeeReviewRequired,
    completed_service_fee_transactions: cancellationResult.paymentSummary.completedTransactionCount,
    expired_service_fee_transactions: cancellationResult.expiredTransactions.modifiedCount || 0,
    swap: await addTimelineToSwap(populatedSwap),
  });
});
