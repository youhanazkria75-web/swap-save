const SwapRequest = require("../models/SwapRequest");
const Product = require("../models/Product");
const Message = require("../models/Message");
const Rating = require("../models/Rating");
const User = require("../models/User");
const Report = require("../models/Report");
const Transaction = require("../models/Transaction");
const asyncHandler = require("../utils/asyncHandler");
const textSimilarity = require("../utils/textSimilarity");
const {
  addTimelineToSwap,
  createSwapTimelineEvent,
  getParticipantActor,
} = require("../utils/swapTimeline");
const {
  CHAT_ALLOWED_STATUSES,
  CONTACT_DETAIL_WARNING,
  containsBlockedContactDetails,
} = require("../utils/messageModeration");
const {
  holdCompensationCoins,
  refundCompensationCoins,
  releaseCompensationCoins,
} = require("../utils/swapCompensation");
const {
  DELIVERY_STATUS,
  getDeliveryStatusFromTracking,
  isDeliveryCompleted,
  normalizeDeliveryTracking,
} = require("../utils/deliveryLifecycle");
const { consumeSwapRequestSlot, getWalletSummary, grantSwapCompletionRewards } = require("../utils/wallet");
const { createNotification, createNotifications, notifyAdmins } = require("../utils/notifications");
const { getUserMetrics } = require("../utils/trustMetrics");
const {
  USER_CANCELLABLE_SWAP_STATUSES,
  expirePendingServiceFeeTransactions,
  getCompletedServiceFeePaymentSummary,
} = require("../utils/swapCancellation");
const egyptLocationsDataset = require("../config/egypt_locations_english_dropdown_dataset.json");
const mongoose = require("mongoose");

const ACTIVE_SWAP_LOCK_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
  "disputed",
];

const DISPUTE_ALLOWED_STATUSES = [
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
];
const SERVICE_FEE_ACTIVE_CHECKOUT_STATUSES = ["pending"];
const SERVICE_FEE_INACTIVE_CHECKOUT_STATUSES = ["failed", "expired"];
const EGYPT_COUNTRY = "Egypt";
const EXCHANGE_TIME_MIN = "09:00";
const EXCHANGE_TIME_MAX = "18:00";
const PICKUP_ADDRESS_MIN_LENGTH = 5;

const egyptMeetingPoints = new Set(
  egyptLocationsDataset.flatMap((location) =>
    (location.areas || []).flatMap((area) => area.meeting_points || [])
  )
);

const isProductAvailableForSwap = (product) =>
  product && ["available", "active"].includes(product.status);

const findAccessibleSwap = (swapId, userId) => {
  if (!mongoose.isValidObjectId(swapId)) {
    return null;
  }

  return SwapRequest.findOne({
    _id: swapId,
    $or: [{ requester: userId }, { receiver: userId }],
  });
};

const USER_SWAP_PUBLIC_SELECT =
  "_id first_name last_name avatar role isEmailVerified isPhoneVerified phone bio country city street_address rating rating_count coins held_coins createdAt updatedAt";

const buildSafePublicUser = async (user, { includeCoins = false } = {}) => {
  if (!user) {
    return user;
  }

  const source = typeof user.toObject === "function" ? user.toObject() : user;
  const userId = source._id || source.id;

  if (!userId) {
    return source;
  }

  const metrics = await getUserMetrics(source);

  const safeUser = {
    _id: source._id,
    first_name: source.first_name,
    last_name: source.last_name,
    avatar: source.avatar || "",
    role: source.role,
    isEmailVerified: Boolean(source.isEmailVerified),
    isPhoneVerified: Boolean(source.isPhoneVerified),
    rating: metrics.rating,
    rating_count: metrics.rating_count,
    completed_swaps: metrics.completed_swaps,
    total_swaps: metrics.total_swaps,
    active_listings_count: metrics.active_listings_count,
    profile_completeness: metrics.profile_completeness,
    trust_score: metrics.trust_score,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };

  if (includeCoins) {
    safeUser.coins = Number(source.coins ?? 50);
    safeUser.held_coins = Number(source.held_coins ?? 0);
  }

  return safeUser;
};

const populateSwapForResponse = (swap) =>
  swap.populate([
    { path: "requester", select: USER_SWAP_PUBLIC_SELECT },
    { path: "receiver", select: USER_SWAP_PUBLIC_SELECT },
    { path: "product_offered" },
    { path: "product_requested" },
  ]);

const removeUserContactFields = (user) => {
  if (!user || typeof user !== "object") {
    return user;
  }

  delete user.email;
  delete user.phone;
  delete user.address;
  delete user.street_address;
  delete user.streetAddress;

  return user;
};

const sanitizeTimelineForUser = (timeline = []) =>
  timeline.map((event) => {
    const source = typeof event.toObject === "function" ? event.toObject() : event;

    if (source.event === "admin_approved") {
      source.description = "Swap approved by admin.";
    }

    if (source.event === "admin_rejected") {
      source.description = "Swap rejected by admin.";
    }

    if (source.event === "cancelled") {
      source.description =
        source.actor === "admin"
          ? "Swap cancelled by admin."
          : "Swap cancelled by participant.";
    }

    if (source.event === "dispute_resolved") {
      source.description = "Dispute resolved by admin.";
    }

    if (source.event === "report_resolved") {
      source.description = "Report resolved by admin.";
    }

    if (source.actor_id && typeof source.actor_id === "object") {
      source.actor_id = removeUserContactFields({ ...source.actor_id });
    }

    return source;
  });

const sanitizeDeliveryDetailsForUser = (swapObject, currentUserId) => {
  if (!swapObject.delivery_details || !currentUserId) {
    return;
  }

  const requesterId = swapObject.requester?._id || swapObject.requester;
  const isRequester = String(requesterId) === String(currentUserId);
  const otherPickupKey = isRequester ? "receiver_pickup" : "requester_pickup";
  const otherPickup = swapObject.delivery_details[otherPickupKey] || {};

  swapObject.delivery_details[otherPickupKey] = {
    address: "",
    country: "",
    city: "",
    area: "",
    preferred_date: "",
    preferred_time: "",
    notes: "",
    submitted: Boolean(otherPickup.submitted),
  };
};

const buildUserSwapResponse = async (swap, currentUserId) => {
  await populateSwapForResponse(swap);

  const swapObject = await addTimelineToSwap(swap);
  const [requester, receiver] = await Promise.all([
    buildSafePublicUser(swapObject.requester, {
      includeCoins: String(swapObject.requester?._id || swapObject.requester) === String(currentUserId),
    }),
    buildSafePublicUser(swapObject.receiver, {
      includeCoins: String(swapObject.receiver?._id || swapObject.receiver) === String(currentUserId),
    }),
  ]);

  swapObject.requester = requester;
  swapObject.receiver = receiver;
  delete swapObject.admin_notes;
  delete swapObject.admin_reviewed_by;
  delete swapObject.admin_reviewed_at;
  swapObject.timeline = sanitizeTimelineForUser(swapObject.timeline || []);
  sanitizeDeliveryDetailsForUser(swapObject, currentUserId);

  const requesterId = swapObject.requester?._id || swapObject.requester;
  const isRequester = String(requesterId) === String(currentUserId);
  const side = isRequester ? "requester" : "receiver";
  const paidField = isRequester ? "requester_paid" : "receiver_paid";
  const serviceFeeTransactions = await Transaction.find({
    user: currentUserId,
    swap: swapObject._id,
    type: "service_fee",
    "metadata.provider": "paymob",
    "metadata.serviceFeeSide": side,
  }).sort({ updatedAt: -1, createdAt: -1 });
  const pendingServiceFeeTransactions = serviceFeeTransactions.filter((transaction) =>
    SERVICE_FEE_ACTIVE_CHECKOUT_STATUSES.includes(transaction.status)
  );
  const activeServiceFeeTransaction =
    pendingServiceFeeTransactions.find(
      (transaction) =>
        transaction.metadata?.paymobPaymentUrl ||
        transaction.metadata?.paymobIframeUrl
    ) ||
    pendingServiceFeeTransactions[0] ||
    null;
  const completedServiceFeeTransaction = serviceFeeTransactions.find(
    (transaction) => transaction.status === "completed"
  );
  const inactiveServiceFeeTransaction = serviceFeeTransactions.find((transaction) =>
    SERVICE_FEE_INACTIVE_CHECKOUT_STATUSES.includes(transaction.status)
  );
  const currentServiceFeeTransaction =
    (swapObject[paidField] ? completedServiceFeeTransaction : activeServiceFeeTransaction) ||
    inactiveServiceFeeTransaction ||
    null;
  const activeServiceFeePaymentUrl =
    activeServiceFeeTransaction?.metadata?.paymobPaymentUrl ||
    activeServiceFeeTransaction?.metadata?.paymobIframeUrl ||
    "";
  const activeServiceFeeIframeUrl =
    activeServiceFeeTransaction?.metadata?.paymobIframeUrl ||
    activeServiceFeeTransaction?.metadata?.paymobPaymentUrl ||
    "";
  const currentServiceFeeStatus = swapObject[paidField]
    ? "completed"
    : activeServiceFeeTransaction
      ? "pending"
      : inactiveServiceFeeTransaction
        ? inactiveServiceFeeTransaction.status
        : "unpaid";

  swapObject.current_user_service_fee = {
    side,
    paid: Boolean(swapObject[paidField]),
    pending: !swapObject[paidField] && Boolean(activeServiceFeeTransaction),
    status: currentServiceFeeStatus,
    transaction_id: currentServiceFeeTransaction ? String(currentServiceFeeTransaction._id) : "",
    checkout_url: !swapObject[paidField] ? activeServiceFeePaymentUrl : "",
    payment_url: !swapObject[paidField] ? activeServiceFeePaymentUrl : "",
    iframe_url: !swapObject[paidField] ? activeServiceFeeIframeUrl : "",
    can_continue: !swapObject[paidField] && Boolean(activeServiceFeePaymentUrl),
    reason:
      currentServiceFeeTransaction?.metadata?.paymobPendingReason ||
      currentServiceFeeTransaction?.metadata?.paymobFailureReason ||
      "",
  };

  return swapObject;
};

const buildUserSwapListResponse = async (swaps, currentUserId) =>
  Promise.all(swaps.map((swap) => buildUserSwapResponse(swap, currentUserId)));

const emptyDeliveryPickup = () => ({
  address: "",
  country: "",
  city: "",
  area: "",
  preferred_date: "",
  preferred_time: "",
  notes: "",
  submitted: false,
});

const deliveryDefaults = () => ({
  requester_pickup: emptyDeliveryPickup(),
  receiver_pickup: emptyDeliveryPickup(),
  fee_per_user: 100,
  payment_method: "cash_to_courier",
  delivery_status: DELIVERY_STATUS.PENDING_PICKUP,
  tracking: {
    requester_item_picked_up: false,
    receiver_item_picked_up: false,
    delivered_to_requester: false,
    delivered_to_receiver: false,
  },
});

const asPlainObject = (value) =>
  value && typeof value.toObject === "function" ? value.toObject() : value;

const normalizeDeliveryDetails = (details) => {
  const source = asPlainObject(details) || {};
  const defaults = deliveryDefaults();
  const tracking = {
    ...defaults.tracking,
    ...normalizeDeliveryTracking(source),
  };

  return {
    requester_pickup: {
      ...defaults.requester_pickup,
      ...(asPlainObject(source.requester_pickup) || {}),
    },
    receiver_pickup: {
      ...defaults.receiver_pickup,
      ...(asPlainObject(source.receiver_pickup) || {}),
    },
    fee_per_user: Number(source.fee_per_user) || defaults.fee_per_user,
    payment_method: "cash_to_courier",
    delivery_status: getDeliveryStatusFromTracking(tracking),
    tracking,
  };
};

const getStringValue = (item, ...keys) => {
  for (const key of keys) {
    if (typeof item[key] === "string") {
      return item[key].trim();
    }
  }

  return "";
};

const getTodayDateValue = () => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
};

const isValidDateValue = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const getTimeMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const validateFutureDateValue = (value, fieldLabel) => {
  if (!value) {
    return `${fieldLabel} is required`;
  }

  if (!isValidDateValue(value)) {
    return `${fieldLabel} must be a valid YYYY-MM-DD date`;
  }

  if (value < getTodayDateValue()) {
    return `${fieldLabel} must be today or a future date`;
  }

  return "";
};

const validateExchangeTimeValue = (value, fieldLabel) => {
  const minutes = getTimeMinutes(value);
  const min = getTimeMinutes(EXCHANGE_TIME_MIN);
  const max = getTimeMinutes(EXCHANGE_TIME_MAX);

  if (!value) {
    return `${fieldLabel} is required`;
  }

  if (minutes === null) {
    return `${fieldLabel} must be a valid HH:mm time`;
  }

  if (minutes < min || minutes > max) {
    return `${fieldLabel} must be between ${EXCHANGE_TIME_MIN} and ${EXCHANGE_TIME_MAX}`;
  }

  return "";
};

const getEgyptLocation = (city) =>
  egyptLocationsDataset.find((location) => location.city === city);

const getEgyptArea = (city, area) =>
  (getEgyptLocation(city)?.areas || []).find((item) => item.name === area);

const validateEgyptCityArea = (city, area, labelPrefix) => {
  if (!city) {
    return { error: `${labelPrefix} city is required` };
  }

  if (!area) {
    return { error: `${labelPrefix} area is required` };
  }

  const location = getEgyptLocation(city);
  if (!location) {
    return { error: `${labelPrefix} city must be a supported Egypt city` };
  }

  const areaEntry = getEgyptArea(city, area);
  if (!areaEntry) {
    return { error: `${labelPrefix} area must belong to the selected city` };
  }

  return { location, areaEntry };
};

const parseMeetupDetails = (body) => {
  const details = body.meetup_details || body.meetupDetails || {};

  return {
    city: getStringValue(details, "city"),
    area: getStringValue(details, "area"),
    selectedMeetingPoint: getStringValue(
      details,
      "selected_meeting_point",
      "selectedMeetingPoint",
      "suggested_meeting_point",
      "suggestedMeetingPoint"
    ),
    legacyMeetingPoint: getStringValue(
      details,
      "meeting_point",
      "meetingPoint",
      "meetup_location",
      "meetupLocation"
    ),
    customLocation: getStringValue(details, "custom_location", "customLocation"),
    date: getStringValue(details, "date", "scheduled_date", "scheduledDate"),
    time: getStringValue(details, "time", "scheduled_time", "scheduledTime"),
    additional_notes: getStringValue(details, "additional_notes", "additionalNotes", "notes"),
  };
};

const validateMeetupDetails = (body) => {
  const parsed = parseMeetupDetails(body);
  const cityArea = validateEgyptCityArea(parsed.city, parsed.area, "Meetup");

  if (cityArea.error) {
    return { error: cityArea.error };
  }

  const dateError = validateFutureDateValue(parsed.date, "Meetup date");
  if (dateError) {
    return { error: dateError };
  }

  const timeError = validateExchangeTimeValue(parsed.time, "Meetup time");
  if (timeError) {
    return { error: timeError };
  }

  const areaMeetingPoints = cityArea.areaEntry.meeting_points || [];
  let meetingPoint = "";

  if (parsed.selectedMeetingPoint) {
    if (!areaMeetingPoints.includes(parsed.selectedMeetingPoint)) {
      return { error: "Suggested meeting point must belong to the selected area" };
    }
    meetingPoint = parsed.selectedMeetingPoint;
  } else if (parsed.legacyMeetingPoint) {
    if (areaMeetingPoints.includes(parsed.legacyMeetingPoint)) {
      meetingPoint = parsed.legacyMeetingPoint;
    } else if (egyptMeetingPoints.has(parsed.legacyMeetingPoint)) {
      return { error: "Suggested meeting point must belong to the selected area" };
    } else {
      meetingPoint = parsed.legacyMeetingPoint;
    }
  } else if (parsed.customLocation) {
    meetingPoint = parsed.customLocation;
  }

  if (!meetingPoint) {
    return {
      error: "Meetup details require a suggested meeting point or custom location",
    };
  }

  return {
    value: {
      city: parsed.city,
      area: parsed.area,
      meeting_point: meetingPoint,
      date: parsed.date,
      time: parsed.time,
      additional_notes: parsed.additional_notes,
    },
  };
};

const parseDeliveryPickupDetails = (body) => {
  const details = body.delivery_details || body.deliveryDetails || {};

  return {
    address: getStringValue(details, "pickup_address", "pickupAddress", "address"),
    country: getStringValue(details, "pickup_country", "pickupCountry", "country"),
    city: getStringValue(details, "pickup_city", "pickupCity", "city"),
    area: getStringValue(details, "pickup_area", "pickupArea", "area"),
    preferred_date: getStringValue(
      details,
      "preferred_pickup_date",
      "preferredPickupDate",
      "preferred_date",
      "preferredDate"
    ),
    preferred_time: getStringValue(
      details,
      "preferred_pickup_time",
      "preferredPickupTime",
      "preferred_time",
      "preferredTime"
    ),
    notes: getStringValue(details, "pickup_notes", "pickupNotes", "notes"),
    submitted: true,
  };
};

const validateDeliveryPickupDetails = (body) => {
  const parsed = parseDeliveryPickupDetails(body);

  if (!parsed.address) {
    return { error: "Pickup address is required" };
  }

  if (parsed.address.length < PICKUP_ADDRESS_MIN_LENGTH) {
    return {
      error: `Pickup address must be at least ${PICKUP_ADDRESS_MIN_LENGTH} characters`,
    };
  }

  if (parsed.country !== EGYPT_COUNTRY) {
    return { error: "Pickup country must be Egypt" };
  }

  const cityArea = validateEgyptCityArea(parsed.city, parsed.area, "Pickup");
  if (cityArea.error) {
    return { error: cityArea.error };
  }

  const dateError = validateFutureDateValue(parsed.preferred_date, "Preferred pickup date");
  if (dateError) {
    return { error: dateError };
  }

  const timeError = validateExchangeTimeValue(parsed.preferred_time, "Preferred pickup time");
  if (timeError) {
    return { error: timeError };
  }

  return { value: parsed };
};

const mapRatingForResponse = (rating) => ({
  id: String(rating._id),
  swap: rating.swap,
  rater: rating.rater,
  rated_user: rating.rated_user,
  score: rating.score,
  tags: rating.tags,
  comment: rating.comment,
  createdAt: rating.createdAt,
  updatedAt: rating.updatedAt,
});

const buildRatedUserSummary = async (userId) => {
  const user = await User.findById(userId).select(
    "_id first_name last_name avatar role isEmailVerified isPhoneVerified rating rating_count createdAt updatedAt is_deleted"
  );

  if (!user || user.is_deleted) {
    return {
      _id: userId,
      id: String(userId),
      first_name: "Deleted",
      last_name: "user",
      avatar: "",
      rating: 0,
      rating_count: 0,
      completed_swaps: 0,
      total_swaps: 0,
      trust_score: 0,
      is_deleted: true,
    };
  }

  return buildSafePublicUser(user);
};

const mapReportForResponse = (report) => ({
  id: String(report._id),
  reporter: report.reporter,
  swap: report.swap,
  target_type: report.target_type,
  target_id: report.target_id,
  reason: report.reason,
  description: report.description,
  status: report.status,
  previous_swap_status: report.previous_swap_status,
  resolution_action: report.resolution_action,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
});

const isParticipant = (swap, userId) =>
  String(swap.requester) === String(userId) ||
  String(swap.receiver) === String(userId);

const getOtherParticipant = (swap, userId) =>
  String(swap.requester) === String(userId) ? swap.receiver : swap.requester;

const loadAccessibleSwapWithProducts = async (swapId, userId) => {
  const swap = await findAccessibleSwap(swapId, userId);

  if (!swap) {
    return null;
  }

  await swap.populate([
    { path: "product_offered", select: "estimated_value owner_id title" },
    { path: "product_requested", select: "estimated_value owner_id title" },
  ]);

  return swap;
};

const getCompensationSides = (swap) => {
  const offeredValue = Number(swap.product_offered?.estimated_value || 0);
  const requestedValue = Number(swap.product_requested?.estimated_value || 0);

  if (offeredValue === requestedValue) {
    return {
      offeredValue,
      requestedValue,
      valueGap: 0,
      payer: null,
      receiver: null,
    };
  }

  const offeredIsLower = offeredValue < requestedValue;
  const payer = offeredIsLower ? swap.requester : swap.receiver;
  const receiver = offeredIsLower ? swap.receiver : swap.requester;

  return {
    offeredValue,
    requestedValue,
    valueGap: Math.abs(offeredValue - requestedValue),
    payer,
    receiver,
  };
};

const updateRatedUserAggregateIfSupported = async (ratedUserId) => {
  if (!User.schema.path("rating") || !User.schema.path("rating_count")) {
    return;
  }

  const [aggregate] = await Rating.aggregate([
    { $match: { rated_user: new mongoose.Types.ObjectId(ratedUserId) } },
    {
      $group: {
        _id: "$rated_user",
        rating: { $avg: "$score" },
        rating_count: { $sum: 1 },
      },
    },
  ]);

  if (!aggregate) {
    return;
  }

  await User.findByIdAndUpdate(ratedUserId, {
    rating: Number(aggregate.rating.toFixed(2)),
    rating_count: aggregate.rating_count,
  });
};

// calculate match score
const calculateMatchScore = (myProduct, otherProduct) => {
  let score = 0;
  const reasons = [];

  // category match
  if (myProduct.category === otherProduct.category) {
    score += 40;
    reasons.push("Same category");
  }

  // condition match
  if (myProduct.condition === otherProduct.condition) {
    score += 20;
    reasons.push("Same condition");
  }

  // price similarity
  const valueDifference = Math.abs(
    (myProduct.estimated_value || 0) - (otherProduct.estimated_value || 0)
  );

  if (valueDifference <= 1000) {
    score += 25;
    reasons.push("Very close price");
  } else if (valueDifference <= 3000) {
    score += 15;
    reasons.push("Close price");
  } else if (valueDifference <= 5000) {
    score += 5;
    reasons.push("Acceptable price difference");
  }

  // location
  if (
    myProduct.location &&
    otherProduct.location &&
    myProduct.location.toLowerCase() === otherProduct.location.toLowerCase()
  ) {
    score += 15;
    reasons.push("Same location");
  }

  // title similarity
  const titleScore = textSimilarity(
    myProduct.title || "",
    otherProduct.title || ""
  );

  if (titleScore > 0.5) {
    score += 10;
    reasons.push("Similar product title");
  }

  // description similarity
  const descScore = textSimilarity(
    myProduct.description || "",
    otherProduct.description || ""
  );

  if (descScore > 0.4) {
    score += 5;
    reasons.push("Similar description");
  }

  let match_level = "weak";

  if (score >= 80) match_level = "excellent";
  else if (score >= 60) match_level = "strong";
  else if (score >= 40) match_level = "medium";

  return { score, match_level, reasons };
};

// create swap request
exports.createSwapRequest = asyncHandler(async (req, res) => {
  const { product_offered, product_requested } = req.body;
  const initialMessage = typeof req.body.message === "string" ? req.body.message.trim() : "";

  if (!product_offered || !product_requested) {
    return res.status(400).json({
      message: "product_offered and product_requested are required",
    });
  }

  if (!mongoose.isValidObjectId(product_offered) || !mongoose.isValidObjectId(product_requested)) {
    return res.status(400).json({
      message: "product_offered and product_requested must be valid ids",
    });
  }

  if (initialMessage.length > 1000) {
    return res.status(400).json({ message: "Message content cannot exceed 1000 characters" });
  }

  const requestedProduct = await Product.findById(product_requested);
  if (!requestedProduct) {
    return res.status(404).json({ message: "Requested product not found" });
  }

  const offeredProduct = await Product.findById(product_offered);
  if (!offeredProduct) {
    return res.status(404).json({ message: "Offered product not found" });
  }

  if (String(requestedProduct.owner_id) === String(req.userId)) {
    return res.status(400).json({
      message: "You can't request your own product",
    });
  }

  if (String(offeredProduct.owner_id) !== String(req.userId)) {
    return res.status(403).json({
      message: "You can only offer your own product",
    });
  }

  if (String(product_offered) === String(product_requested)) {
    return res.status(400).json({
      message: "You can't swap the same product",
    });
  }

  const selectedProductIds = [product_offered, product_requested];
  const conflictingSwap = await SwapRequest.findOne({
    status: { $in: ACTIVE_SWAP_LOCK_STATUSES },
    $or: [
      { product_offered: { $in: selectedProductIds } },
      { product_requested: { $in: selectedProductIds } },
    ],
  }).select("_id status product_offered product_requested");

  if (conflictingSwap) {
    return res.status(409).json({
      message: "One of the selected products is already involved in an active swap.",
    });
  }

  if (!isProductAvailableForSwap(requestedProduct)) {
    return res.status(400).json({
      message: "Requested product is not available for swap",
    });
  }

  if (!isProductAvailableForSwap(offeredProduct)) {
    return res.status(400).json({
      message: "Offered product is not available for swap",
    });
  }

  const receiver = requestedProduct.owner_id;
  const swapSlot = await consumeSwapRequestSlot(req.userId);

  const swap = await SwapRequest.create({
    requester: req.userId,
    receiver,
    product_offered,
    product_requested,
    status: "pending",
  });

  if (initialMessage) {
    await Message.create({
      swap: swap._id,
      sender: req.userId,
      type: "text",
      content: initialMessage,
      read_by: [req.userId],
    });
  }

  await createSwapTimelineEvent({
    swap,
    event: "request_created",
    description: "Swap request created.",
    actor: "requester",
    actor_id: req.userId,
  });

  await createNotification({
    user: receiver,
    type: "swap-request",
    title: "New swap request",
    body: "You received a new swap request.",
    related_swap: swap._id,
  });

  return res.status(201).json({
    message: "Swap request sent successfully",
    swap_slot: swapSlot.type,
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// get all swaps for current user
exports.getMySwapRequests = asyncHandler(async (req, res) => {
  const swaps = await SwapRequest.find({
    $or: [{ requester: req.userId }, { receiver: req.userId }],
  })
    .populate("requester", USER_SWAP_PUBLIC_SELECT)
    .populate("receiver", USER_SWAP_PUBLIC_SELECT)
    .populate("product_offered")
    .populate("product_requested")
    .sort({ createdAt: -1 });

  return res.json({
    count: swaps.length,
    swaps: await buildUserSwapListResponse(swaps, req.userId),
  });
});

// get a single swap for current user
exports.getSwapById = asyncHandler(async (req, res) => {
  const swapQuery = findAccessibleSwap(req.params.id, req.userId);

  if (!swapQuery) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await swapQuery
    .populate("requester", USER_SWAP_PUBLIC_SELECT)
    .populate("receiver", USER_SWAP_PUBLIC_SELECT)
    .populate("product_offered")
    .populate("product_requested");

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  return res.json({ swap: await buildUserSwapResponse(swap, req.userId) });
});

// get messages for a swap
exports.getSwapMessages = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const messages = await Message.find({ swap: swap._id })
    .populate("sender", "_id first_name last_name avatar")
    .sort({ createdAt: 1 });

  return res.json({ messages });
});

// send a message for a swap
exports.createSwapMessage = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (!CHAT_ALLOWED_STATUSES.has(swap.status)) {
    return res.status(400).json({
      message: "Messaging is unavailable at this stage.",
    });
  }

  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!content) {
    return res.status(400).json({ message: "Message content is required" });
  }

  if (content.length > 1000) {
    return res.status(400).json({ message: "Message content cannot exceed 1000 characters" });
  }

  if (containsBlockedContactDetails(content)) {
    return res.status(400).json({ message: CONTACT_DETAIL_WARNING });
  }

  const message = await Message.create({
    swap: swap._id,
    sender: req.userId,
    type: "text",
    content,
    read_by: [req.userId],
  });

  await message.populate("sender", "_id first_name last_name avatar");

  const recipient =
    String(swap.requester) === String(req.userId)
      ? swap.receiver
      : swap.requester;

  if (String(recipient) !== String(req.userId)) {
    await createNotification({
      user: recipient,
      type: "message",
      title: "New message",
      body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
      related_swap: swap._id,
    });
  }

  return res.status(201).json({ message });
});

// get sent swaps
exports.getSentSwaps = asyncHandler(async (req, res) => {
  const swaps = await SwapRequest.find({ requester: req.userId })
    .populate("receiver", USER_SWAP_PUBLIC_SELECT)
    .populate("product_offered")
    .populate("product_requested")
    .sort({ createdAt: -1 });

  return res.json({
    count: swaps.length,
    swaps: await buildUserSwapListResponse(swaps, req.userId),
  });
});

// get received swaps
exports.getReceivedSwaps = asyncHandler(async (req, res) => {
  const swaps = await SwapRequest.find({ receiver: req.userId })
    .populate("requester", USER_SWAP_PUBLIC_SELECT)
    .populate("product_offered")
    .populate("product_requested")
    .sort({ createdAt: -1 });

  return res.json({
    count: swaps.length,
    swaps: await buildUserSwapListResponse(swaps, req.userId),
  });
});

// smart suggestions
exports.getSwapSuggestions = asyncHandler(async (req, res) => {
  const myProducts = await Product.find({
    owner_id: req.userId,
    status: "available",
  });

  if (!myProducts.length) {
    return res.json({
      count: 0,
      suggestions: [],
    });
  }

  const otherProducts = await Product.find({
    owner_id: { $ne: req.userId },
    status: "available",
  });

  const suggestions = [];

  for (const myProduct of myProducts) {
    for (const otherProduct of otherProducts) {
      const match = calculateMatchScore(myProduct, otherProduct);

      if (match.score < 30) continue;

      suggestions.push({
        my_product: myProduct,
        matched_product: otherProduct,
        score: match.score,
        match_level: match.match_level,
        reasons: match.reasons,
      });
    }
  }

  const sorted = suggestions.sort((a, b) => b.score - a.score);

  // remove duplicate matched products only
  const uniqueMap = new Map();

  for (const suggestion of sorted) {
    const key = suggestion.matched_product._id.toString();

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, suggestion);
    }
  }

  const uniqueSuggestions = Array.from(uniqueMap.values());

  const finalSuggestions = uniqueSuggestions.map((s, index) => {
    let confidence = "low";

    if (s.score >= 90) confidence = "very_high";
    else if (s.score >= 70) confidence = "high";
    else if (s.score >= 50) confidence = "medium";

    return {
      rank: index + 1,
      my_product_id: s.my_product._id,
      matched_product_id: s.matched_product._id,
      score: s.score,
      confidence,
      match_level: s.match_level,
      reasons: s.reasons,
      my_product: s.my_product,
      matched_product: s.matched_product,
    };
  });

  return res.json({
    count: finalSuggestions.length,
    suggestions: finalSuggestions.slice(0, 20),
  });
});

// submit swap for admin review
exports.submitForReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const isParticipant =
    String(swap.requester) === String(req.userId) ||
    String(swap.receiver) === String(req.userId);

  if (!isParticipant) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "in_discussion") {
    return res.status(400).json({
      message: "Swap must be in discussion before submitting for review",
    });
  }

  swap.status = "under_review";
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "submitted_review",
    description: "Swap submitted for admin review.",
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  await Promise.all([
    createNotifications([
      {
        user: swap.requester,
        type: "system",
        title: "Swap submitted for review",
        body: "This swap was submitted for admin review.",
        related_swap: swap._id,
      },
      {
        user: swap.receiver,
        type: "system",
        title: "Swap submitted for review",
        body: "This swap was submitted for admin review.",
        related_swap: swap._id,
      },
    ]),
    notifyAdmins({
      type: "system",
      title: "Swap awaiting review",
      body: "A swap was submitted for admin review.",
      related_swap: swap._id,
      target_type: "approval",
      target_id: swap._id,
      target_url: "/admin/approvals",
    }),
  ]);

  return res.json({
    message: "Swap submitted for admin review",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// Legacy route kept to avoid silently faking service-fee payment.
exports.payServiceFee = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  return res.status(410).json({
    message: "Use /swaps/:id/service-fee/checkout to pay service fees through Paymob",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

exports.cancelSwapRequest = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (!USER_CANCELLABLE_SWAP_STATUSES.includes(swap.status)) {
    return res.status(409).json({
      message: "Cancellation is not available for this swap stage. Please contact admin support or open a dispute.",
    });
  }

  const paymentSummary = await getCompletedServiceFeePaymentSummary(swap);

  if (swap.status === "payment_pending" && paymentSummary.anyPaid) {
    return res.status(409).json({
      message: "This swap has a confirmed service fee payment. Please contact admin support or open a dispute.",
    });
  }

  const previousStatus = swap.status;
  const actor = getParticipantActor(swap, req.userId);
  const recipient = actor === "requester" ? swap.receiver : swap.requester;

  swap.status = "cancelled";
  await swap.save();

  const expiredTransactions = await expirePendingServiceFeeTransactions(swap, {
    actor,
    actorId: req.userId,
    reason: "Pending service fee checkout expired because the swap was cancelled by a participant.",
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

  await createSwapTimelineEvent({
    swap,
    event: "cancelled",
    description: "Swap cancelled by participant.",
    actor,
    actor_id: req.userId,
  });

  await createNotification({
    user: recipient,
    type: "system",
    title: "Swap cancelled",
    body: "The other participant cancelled this swap.",
    related_swap: swap._id,
  });

  if (["under_review", "approved", "payment_pending"].includes(previousStatus)) {
    await notifyAdmins({
      type: "system",
      title: "Swap cancelled by participant",
      body: "A participant cancelled a swap that had reached review or payment preparation.",
      related_swap: swap._id,
      target_type: "swap",
      target_id: swap._id,
      target_url: `/admin/swaps/${swap._id}`,
    });
  }

  return res.json({
    message: "Swap cancelled successfully",
    expired_service_fee_transactions: expiredTransactions.modifiedCount || 0,
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

exports.proposeCompensation = asyncHandler(async (req, res) => {
  const swap = await loadAccessibleSwapWithProducts(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "in_discussion") {
    return res.status(400).json({ message: "Coin compensation can only be proposed during discussion" });
  }

  if (swap.compensation_status === "proposed") {
    return res.status(400).json({ message: "A coin compensation proposal is already pending" });
  }

  if (["held", "released"].includes(swap.compensation_status)) {
    return res.status(400).json({ message: "Coin compensation has already been accepted for this swap" });
  }

  const amount = Number(req.body.amount);

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ message: "Compensation amount must be a positive whole number of coins" });
  }

  const { payer, receiver, valueGap } = getCompensationSides(swap);

  if (!payer || !receiver || valueGap <= 0) {
    return res.status(400).json({ message: "Coin compensation requires a product value gap" });
  }

  if (String(payer) !== String(req.userId)) {
    return res.status(403).json({
      message: "Only the participant offering the lower-value product can propose coin compensation",
    });
  }

  if (String(payer) === String(receiver)) {
    return res.status(400).json({ message: "Cannot propose compensation to yourself" });
  }

  const currentUser = await User.findById(req.userId).select("coins held_coins");

  if (!currentUser) {
    return res.status(404).json({ message: "User not found" });
  }

  if (typeof currentUser.coins !== "number") {
    await User.updateOne(
      { _id: req.userId },
      { $set: { coins: 50, held_coins: Number(currentUser.held_coins || 0) } }
    );
    currentUser.coins = 50;
  }

  if (amount > Number(currentUser.coins || 0)) {
    return res.status(400).json({ message: "Not enough available coins for this compensation proposal" });
  }

  swap.compensation_amount = amount;
  swap.compensation_payer = payer;
  swap.compensation_receiver = receiver;
  swap.compensation_status = "proposed";
  swap.compensation_proposed_by = req.userId;
  swap.compensation_accepted_by = null;
  swap.compensation_proposed_at = new Date();
  swap.compensation_accepted_at = undefined;
  swap.compensation_rejected_at = undefined;
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "compensation_proposed",
    description: `${amount} coins proposed as value gap compensation.`,
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  await createNotification({
    user: receiver,
    type: "system",
    title: "Coin compensation proposed",
    body: "The other participant proposed coin compensation for the value gap.",
    related_swap: swap._id,
  });

  return res.json({
    message: "Coin compensation proposed",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

exports.acceptCompensation = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "in_discussion") {
    return res.status(400).json({ message: "Coin compensation can only be accepted during discussion" });
  }

  if (swap.compensation_status !== "proposed") {
    return res.status(400).json({ message: "There is no pending coin compensation proposal to accept" });
  }

  if (String(swap.compensation_payer) === String(req.userId)) {
    return res.status(400).json({ message: "The compensation payer cannot accept their own proposal" });
  }

  if (String(swap.compensation_receiver) !== String(req.userId)) {
    return res.status(403).json({ message: "Only the compensation receiver can accept this proposal" });
  }

  const holdResult = await holdCompensationCoins(swap, req.userId);

  if (holdResult.moved) {
    await createSwapTimelineEvent({
      swap,
      event: "compensation_held",
      description: `${holdResult.amount} coins held safely for swap compensation.`,
      actor: getParticipantActor(swap, req.userId),
      actor_id: req.userId,
    });

    await Promise.all([
      createNotification({
        user: swap.compensation_payer,
        type: "system",
        title: "Coins held safely",
        body: `${holdResult.amount} coins are held safely until swap completion.`,
        related_swap: swap._id,
      }),
      createNotification({
        user: swap.compensation_receiver,
        type: "system",
        title: "Coin compensation accepted",
        body: `${holdResult.amount} coins are held safely until swap completion.`,
        related_swap: swap._id,
      }),
    ]);
  }

  return res.json({
    message: "Coin compensation accepted and held",
    wallet: await getWalletSummary(req.userId),
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

exports.rejectCompensation = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "in_discussion") {
    return res.status(400).json({ message: "Coin compensation can only be rejected during discussion" });
  }

  if (swap.compensation_status !== "proposed") {
    return res.status(400).json({ message: "There is no pending coin compensation proposal to reject" });
  }

  if (String(swap.compensation_payer) === String(req.userId)) {
    return res.status(400).json({ message: "The compensation payer cannot reject their own proposal" });
  }

  if (String(swap.compensation_receiver) !== String(req.userId)) {
    return res.status(403).json({ message: "Only the compensation receiver can reject this proposal" });
  }

  swap.compensation_status = "rejected";
  swap.compensation_rejected_at = new Date();
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "compensation_rejected",
    description: "Coin compensation proposal rejected.",
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  await createNotification({
    user: swap.compensation_payer,
    type: "system",
    title: "Coin compensation rejected",
    body: "The other participant rejected the coin compensation proposal. The swap can continue without compensation.",
    related_swap: swap._id,
  });

  return res.json({
    message: "Coin compensation rejected",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// propose exchange method details
exports.setExchangeMethod = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "exchange_setup") {
    return res.status(400).json({
      message: "Exchange method can only be set during exchange setup",
    });
  }

  if (!swap.requester_paid || !swap.receiver_paid) {
    return res.status(400).json({
      message: "Exchange setup is available only after both service fees are paid",
    });
  }

  const exchangeMethod = req.body.exchange_method || req.body.exchangeMethod;

  if (!["meetup", "delivery"].includes(exchangeMethod)) {
    return res.status(400).json({ message: "exchange_method must be meetup or delivery" });
  }

  if (exchangeMethod === "meetup") {
    if (swap.exchange_proposal_status === "pending") {
      return res.status(400).json({
        message: "An exchange proposal is already pending",
      });
    }

    const meetupValidation = validateMeetupDetails(req.body);

    if (meetupValidation.error) {
      return res.status(400).json({ message: meetupValidation.error });
    }

    swap.exchange_method = "meetup";
    swap.meetup_details = meetupValidation.value;
    swap.delivery_details = undefined;
    swap.exchange_proposed_by = req.userId;
    swap.exchange_accepted_by = null;
    swap.exchange_proposal_status = "pending";
  } else {
    const pickupValidation = validateDeliveryPickupDetails(req.body);

    if (pickupValidation.error) {
      return res.status(400).json({ message: pickupValidation.error });
    }

    const pickupDetails = pickupValidation.value;
    const deliveryDetails = normalizeDeliveryDetails(swap.delivery_details);
    const pickupKey =
      String(swap.requester) === String(req.userId)
        ? "requester_pickup"
        : "receiver_pickup";

    swap.exchange_method = "delivery";
    deliveryDetails[pickupKey] = pickupDetails;
    swap.delivery_details = deliveryDetails;
    swap.meetup_details = undefined;
    swap.exchange_proposed_by = null;
    swap.exchange_accepted_by = null;
    swap.exchange_proposal_status = "none";

    if (
      deliveryDetails.requester_pickup.submitted &&
      deliveryDetails.receiver_pickup.submitted
    ) {
      deliveryDetails.delivery_status = DELIVERY_STATUS.PENDING_PICKUP;
      swap.status = "in_progress";
    }
  }

  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "exchange_setup_submitted",
    description:
      exchangeMethod === "meetup"
        ? "Meetup exchange details proposed."
        : swap.status === "in_progress"
          ? "Both pickup details submitted. Platform delivery moved into progress."
          : "Delivery pickup details submitted.",
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  const recipient =
    String(swap.requester) === String(req.userId)
      ? swap.receiver
      : swap.requester;

  if (exchangeMethod === "delivery" && swap.status === "in_progress") {
    await createSwapTimelineEvent({
      swap,
      event: "delivery_scheduled",
      description: "Pickup scheduled for platform delivery.",
      actor: "system",
    });

    await Promise.all([
      createNotification({
        user: swap.requester,
        type: "delivery",
        title: "Pickup scheduled",
        body: "Both pickup details were submitted. Courier pickup is scheduled.",
        related_swap: swap._id,
      }),
      createNotification({
        user: swap.receiver,
        type: "delivery",
        title: "Pickup scheduled",
        body: "Both pickup details were submitted. Courier pickup is scheduled.",
        related_swap: swap._id,
      }),
    ]);
  } else {
    await createNotification({
      user: recipient,
      type: exchangeMethod === "delivery" ? "delivery" : "system",
      title: exchangeMethod === "meetup" ? "Exchange details proposed" : "Pickup details submitted",
      body:
        exchangeMethod === "meetup"
          ? "The other participant proposed exchange details. Review and accept them to start the exchange."
          : "The other participant submitted pickup details. Submit yours to start platform delivery.",
      related_swap: swap._id,
    });
  }

  return res.json({
    message:
      exchangeMethod === "meetup"
        ? "Exchange method proposed successfully"
        : swap.status === "in_progress"
          ? "Both pickup details submitted. Delivery is now in progress"
          : "Pickup details submitted successfully",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// accept proposed exchange details and move swap into progress
exports.acceptExchangeMethod = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "exchange_setup") {
    return res.status(400).json({
      message: "Exchange details can only be accepted during exchange setup",
    });
  }

  if (swap.exchange_method === "delivery") {
    return res.status(400).json({
      message: "Platform delivery starts after both users submit pickup details",
    });
  }

  if (swap.exchange_proposal_status !== "pending") {
    return res.status(400).json({
      message: "There is no pending exchange proposal to accept",
    });
  }

  if (!swap.exchange_proposed_by) {
    return res.status(400).json({ message: "Exchange proposal is missing proposer" });
  }

  if (String(swap.exchange_proposed_by) === String(req.userId)) {
    return res.status(400).json({
      message: "The proposer cannot accept their own exchange details",
    });
  }

  swap.exchange_accepted_by = req.userId;
  swap.exchange_proposal_status = "accepted";
  swap.status = "in_progress";
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "exchange_proposal_accepted",
    description: "Exchange details accepted. Swap moved into progress.",
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  await Promise.all([
    createNotification({
      user: swap.requester,
      type: "system",
      title: "Exchange details accepted",
      body: "Exchange details were accepted. Your swap is now in progress.",
      related_swap: swap._id,
    }),
    createNotification({
      user: swap.receiver,
      type: "system",
      title: "Exchange details accepted",
      body: "Exchange details were accepted. Your swap is now in progress.",
      related_swap: swap._id,
    }),
  ]);

  return res.json({
    message: "Exchange details accepted",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// request changes to proposed exchange details
exports.requestExchangeChanges = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "exchange_setup") {
    return res.status(400).json({
      message: "Exchange changes can only be requested during exchange setup",
    });
  }

  if (swap.exchange_method === "delivery") {
    return res.status(400).json({
      message: "Platform delivery does not use exchange proposal changes",
    });
  }

  if (swap.exchange_proposal_status !== "pending") {
    return res.status(400).json({
      message: "There is no pending exchange proposal to request changes for",
    });
  }

  if (!swap.exchange_proposed_by) {
    return res.status(400).json({ message: "Exchange proposal is missing proposer" });
  }

  if (String(swap.exchange_proposed_by) === String(req.userId)) {
    return res.status(400).json({
      message: "The proposer cannot request changes to their own exchange details",
    });
  }

  swap.exchange_accepted_by = null;
  swap.exchange_proposal_status = "changes_requested";
  await swap.save();

  const recipient =
    String(swap.requester) === String(req.userId)
      ? swap.receiver
      : swap.requester;

  await createSwapTimelineEvent({
    swap,
    event: "exchange_changes_requested",
    description: "Changes requested for proposed exchange details.",
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  await createNotification({
    user: recipient,
    type: "system",
    title: "Exchange changes requested",
    body: "The other participant requested changes to the proposed exchange details.",
    related_swap: swap._id,
  });

  return res.json({
    message: "Exchange changes requested",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// confirm completion and finish the swap once both participants confirm
exports.confirmCompletion = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "in_progress") {
    return res.status(400).json({
      message: "Completion can only be confirmed while the swap is in progress",
    });
  }

  if (swap.exchange_method === "delivery" && !isDeliveryCompleted(swap.delivery_details)) {
    return res.status(400).json({
      message: "Delivery must be completed before confirming swap completion",
    });
  }

  const isRequester = String(swap.requester) === String(req.userId);
  const alreadyConfirmed = isRequester
    ? swap.requester_confirmed
    : swap.receiver_confirmed;

  if (isRequester) {
    swap.requester_confirmed = true;
  } else {
    swap.receiver_confirmed = true;
  }

  const completedNow = swap.requester_confirmed && swap.receiver_confirmed;

  if (completedNow) {
    swap.status = "completed";
    swap.completed_at = new Date();
  }

  await swap.save();

  if (!alreadyConfirmed) {
    await createSwapTimelineEvent({
      swap,
      event: "completion_confirmed",
      description: "A participant confirmed completion.",
      actor: isRequester ? "requester" : "receiver",
      actor_id: req.userId,
    });
  }

  if (completedNow) {
    await Product.updateMany(
      { _id: { $in: [swap.product_offered, swap.product_requested] } },
      { $set: { status: "swapped" } }
    );

    const releaseResult = await releaseCompensationCoins(swap);

    if (releaseResult.moved) {
      await createSwapTimelineEvent({
        swap,
        event: "compensation_released",
        description: `${releaseResult.amount} held coins released after swap completion.`,
        actor: "system",
      });

      await Promise.all([
        createNotification({
          user: releaseResult.payer,
          type: "system",
          title: "Held coins released",
          body: `${releaseResult.amount} held coins were released after swap completion.`,
          related_swap: swap._id,
        }),
        createNotification({
          user: releaseResult.receiver,
          type: "system",
          title: "Coins received",
          body: `${releaseResult.amount} compensation coins were added to your balance after swap completion.`,
          related_swap: swap._id,
        }),
      ]);
    }

    await grantSwapCompletionRewards(swap, {
      source: "swap_completion",
    });

    await Promise.all([
      createNotification({
        user: swap.requester,
        type: "system",
        title: "Swap completed",
        body: "Both participants confirmed completion. The swap is now complete.",
        related_swap: swap._id,
      }),
      createNotification({
        user: swap.receiver,
        type: "system",
        title: "Swap completed",
        body: "Both participants confirmed completion. The swap is now complete.",
        related_swap: swap._id,
      }),
    ]);

    await createSwapTimelineEvent({
      swap,
      event: "completed",
      description: "Both participants confirmed completion. Swap completed.",
      actor: "system",
    });
  } else if (!alreadyConfirmed) {
    const recipient = isRequester ? swap.receiver : swap.requester;

    await createNotification({
      user: recipient,
      type: "system",
      title: "Completion confirmed",
      body: "The other participant confirmed completion. Confirm when you have received and inspected your item.",
      related_swap: swap._id,
    });
  }

  return res.json({
    message: completedNow
      ? "Swap completed successfully"
      : alreadyConfirmed
        ? "Completion was already confirmed"
        : "Completion confirmed",
    wallet: await getWalletSummary(req.userId),
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// create a rating after a completed swap
exports.createSwapRating = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (swap.status !== "completed") {
    return res.status(400).json({ message: "Ratings can only be submitted after a swap is completed" });
  }

  const score = Number(req.body.score);

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ message: "Rating score must be an integer between 1 and 5" });
  }

  const isRequester = String(swap.requester) === String(req.userId);
  const ratedUser = isRequester ? swap.receiver : swap.requester;

  if (String(ratedUser) === String(req.userId)) {
    return res.status(400).json({ message: "You cannot rate yourself" });
  }

  const tags = Array.isArray(req.body.tags)
    ? req.body.tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 40))
        .slice(0, 12)
    : [];
  const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";

  if (comment.length > 1000) {
    return res.status(400).json({ message: "Rating comment cannot exceed 1000 characters" });
  }

  try {
    const rating = await Rating.create({
      swap: swap._id,
      rater: req.userId,
      rated_user: ratedUser,
      score,
      tags,
      comment,
    });

    await updateRatedUserAggregateIfSupported(ratedUser);

    await createNotification({
      user: ratedUser,
      type: "rating",
      title: "New rating received",
      body: "The other participant rated your completed swap.",
      related_swap: swap._id,
    });

    return res.status(201).json({
      message: "Rating submitted successfully",
      rating: mapRatingForResponse(rating),
      rated_user: await buildRatedUserSummary(ratedUser),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ message: "You have already rated this swap" });
    }

    throw error;
  }
});

// get ratings for a swap
exports.getSwapRatings = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const isParticipant =
    String(swap.requester) === String(req.userId) ||
    String(swap.receiver) === String(req.userId);

  if (!isParticipant) {
    const user = await User.findById(req.userId).select("role");

    if (!user || user.role !== "admin") {
      return res.status(404).json({ message: "Swap request not found" });
    }
  }

  const ratings = await Rating.find({ swap: swap._id }).sort({ createdAt: -1 });

  return res.json({
    count: ratings.length,
    ratings: ratings.map(mapRatingForResponse),
  });
});

// report a swap discussion or open a swap-level dispute
exports.createSwapReport = asyncHandler(async (req, res) => {
  const swap = await findAccessibleSwap(req.params.id, req.userId);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const targetType = req.body.target_type || req.body.targetType;
  const targetId = req.body.target_id || req.body.targetId;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  const description =
    typeof req.body.description === "string" ? req.body.description.trim() : "";

  if (!["swap", "message", "product", "user"].includes(targetType)) {
    return res.status(400).json({ message: "target_type must be swap, message, product, or user" });
  }

  if (targetId && !mongoose.isValidObjectId(targetId)) {
    return res.status(400).json({ message: "target_id must be a valid id" });
  }

  if (!reason) {
    return res.status(400).json({ message: "Report reason is required" });
  }

  if (description.length > 2000) {
    return res.status(400).json({ message: "Report description cannot exceed 2000 characters" });
  }

  const shouldDisputeSwap = targetType === "swap";
  let reportedMessage = null;

  if (targetType === "message" && targetId) {
    reportedMessage = await Message.findOne({ _id: targetId, swap: swap._id });

    if (!reportedMessage) {
      return res.status(404).json({ message: "Message not found for this swap" });
    }
  }

  if (targetType === "product") {
    if (!targetId) {
      return res.status(400).json({ message: "target_id is required for product reports" });
    }

    const productIds = [String(swap.product_offered), String(swap.product_requested)];

    if (!productIds.includes(String(targetId))) {
      return res.status(400).json({ message: "Product report target must belong to this swap" });
    }
  }

  if (targetType === "user") {
    if (!targetId) {
      return res.status(400).json({ message: "target_id is required for user reports" });
    }

    const participantIds = [String(swap.requester), String(swap.receiver)];

    if (!participantIds.includes(String(targetId))) {
      return res.status(400).json({ message: "User report target must be a swap participant" });
    }
  }

  if (shouldDisputeSwap) {
    const activeDispute = await Report.findOne({
      swap: swap._id,
      target_type: "swap",
      status: { $in: ["open", "under_review"] },
    }).select("_id");

    if (activeDispute) {
      return res.status(400).json({ message: "An active dispute already exists for this swap" });
    }

    if (!DISPUTE_ALLOWED_STATUSES.includes(swap.status)) {
      return res.status(400).json({
        message: "A dispute can only be opened while the swap is active",
      });
    }
  }

  const previousSwapStatus = shouldDisputeSwap ? swap.status : undefined;

  const report = await Report.create({
    reporter: req.userId,
    swap: swap._id,
    target_type: targetType,
    target_id: targetId || swap._id,
    reason,
    description,
    previous_swap_status: previousSwapStatus,
  });

  if (reportedMessage) {
    reportedMessage.is_reported = true;
    reportedMessage.report_reason = reason;
    await reportedMessage.save();
  }

  if (shouldDisputeSwap) {
    swap.status = "disputed";
    await swap.save();
  }

  await createSwapTimelineEvent({
    swap,
    event: shouldDisputeSwap ? "dispute_opened" : "report_opened",
    description: shouldDisputeSwap
      ? `Dispute opened: ${reason}`
      : `Report submitted: ${reason}`,
    actor: getParticipantActor(swap, req.userId),
    actor_id: req.userId,
  });

  if (shouldDisputeSwap) {
    await Promise.all([
      createNotifications([
        {
          user: swap.requester,
          type: "system",
          title: "Dispute opened",
          body: "This swap is paused while an admin reviews the dispute.",
          related_swap: swap._id,
        },
        {
          user: swap.receiver,
          type: "system",
          title: "Dispute opened",
          body: "This swap is paused while an admin reviews the dispute.",
          related_swap: swap._id,
        },
      ]),
      notifyAdmins({
        type: "system",
        title: "New swap dispute",
        body: `A swap dispute was opened: ${reason}`,
        related_swap: swap._id,
      }),
    ]);
  } else {
    await notifyAdmins({
      type: "report",
      title: "New report submitted",
      body: `A ${targetType} report was submitted: ${reason}`,
      target_type: "report",
      target_id: report._id,
      target_url: "/admin/reports",
    });
  }

  return res.status(201).json({
    message: shouldDisputeSwap ? "Dispute opened successfully" : "Report submitted successfully",
    report: mapReportForResponse(report),
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// accept swap
exports.acceptSwapRequest = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (String(swap.receiver) !== String(req.userId)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  if (swap.status !== "pending") {
    return res.status(400).json({ message: "Swap already processed" });
  }

  const offeredProduct = await Product.findById(swap.product_offered);
  const requestedProduct = await Product.findById(swap.product_requested);

  if (!offeredProduct || !requestedProduct) {
    return res.status(404).json({
      message: "Product not found for this swap",
    });
  }

  if (
    !isProductAvailableForSwap(offeredProduct) ||
    !isProductAvailableForSwap(requestedProduct)
  ) {
    return res.status(400).json({
      message: "One of the products is no longer available for swap",
    });
  }

  swap.status = "in_discussion";
  await swap.save();

  await createSwapTimelineEvent({
    swap,
    event: "interest_accepted",
    description: "Swap interest accepted. Discussion opened.",
    actor: "receiver",
    actor_id: req.userId,
  });

  await createNotification({
    user: swap.requester,
    type: "swap-accepted",
    title: "Swap accepted",
    body: "Your swap request was accepted. You can now discuss the swap details.",
    related_swap: swap._id,
  });

  await SwapRequest.updateMany(
    {
      _id: { $ne: swap._id },
      status: "pending",
      $or: [
        { product_offered: swap.product_offered },
        { product_requested: swap.product_offered },
        { product_offered: swap.product_requested },
        { product_requested: swap.product_requested },
      ],
    },
    { status: "rejected" }
  );

  return res.json({
    message: "Swap accepted",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});

// reject swap
exports.rejectSwapRequest = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await SwapRequest.findById(req.params.id);

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (String(swap.receiver) !== String(req.userId)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  if (swap.status !== "pending") {
    return res.status(400).json({ message: "Swap already processed" });
  }

  swap.status = "rejected";
  await swap.save();

  const refundResult = await refundCompensationCoins(swap);

  if (refundResult.moved) {
    await createSwapTimelineEvent({
      swap,
      event: "compensation_refunded",
      description: `${refundResult.amount} held compensation coins refunded.`,
      actor: "system",
    });

    await createNotification({
      user: refundResult.payer,
      type: "system",
      title: "Held coins refunded",
      body: `${refundResult.amount} held compensation coins were refunded.`,
      related_swap: swap._id,
    });
  }

  await createSwapTimelineEvent({
    swap,
    event: "rejected",
    description: "Swap request rejected.",
    actor: "receiver",
    actor_id: req.userId,
  });

  await createNotification({
    user: swap.requester,
    type: "swap-rejected",
    title: "Swap rejected",
    body: "Your swap request was rejected.",
    related_swap: swap._id,
  });

  return res.json({
    message: "Swap rejected",
    swap: await buildUserSwapResponse(swap, req.userId),
  });
});
