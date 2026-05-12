const Notification = require("../models/Notification");
const User = require("../models/User");
const mongoose = require("mongoose");

const DEFAULT_NOTIFICATION_PREFERENCES = {
  swap_requests_enabled: true,
  new_messages_enabled: true,
  admin_decisions_enabled: true,
  new_ratings_enabled: true,
  promotions_enabled: false,
  weekly_digest_enabled: true,
};

const NOTIFICATION_TYPE_PREFERENCE = {
  "swap-request": "swap_requests_enabled",
  "swap-accepted": "swap_requests_enabled",
  "swap-completed": "swap_requests_enabled",
  message: "new_messages_enabled",
  "swap-approved": "admin_decisions_enabled",
  "swap-rejected": "admin_decisions_enabled",
  delivery: "swap_requests_enabled",
  rating: "new_ratings_enabled",
  promotion: "promotions_enabled",
  "weekly-digest": "weekly_digest_enabled",
};

const BYPASS_PREFERENCES = new Set(["payment"]);

const getId = (value) => {
  if (!value) return "";
  return String(value._id || value.id || value);
};

const getPreferenceKey = (payload) => {
  if (payload.preference_key) {
    return payload.preference_key;
  }

  if (NOTIFICATION_TYPE_PREFERENCE[payload.type]) {
    return NOTIFICATION_TYPE_PREFERENCE[payload.type];
  }

  if (payload.related_swap) {
    return "swap_requests_enabled";
  }

  return null;
};

const isValidObjectId = (value) => mongoose.isValidObjectId(value);

const normalizeTargetId = (value) => {
  const id = getId(value);
  return isValidObjectId(id) ? id : null;
};

const getDefaultTargetUrl = (payload, { admin = false } = {}) => {
  if (payload.target_url) {
    return payload.target_url;
  }

  const swapId = getId(payload.related_swap || (payload.target_type === "swap" ? payload.target_id : ""));

  if (swapId) {
    return admin ? `/admin/swaps/${swapId}` : `/user/swaps/${swapId}`;
  }

  if (payload.target_type === "wallet") {
    return "/user/coins";
  }

  if (payload.target_type === "product" && payload.target_id) {
    return `/products/${getId(payload.target_id)}`;
  }

  if (payload.target_type === "user" && payload.target_id) {
    return `/users/${getId(payload.target_id)}`;
  }

  if (payload.target_type === "report") {
    return "/admin/reports";
  }

  if (payload.target_type === "support") {
    return "/admin/support";
  }

  if (payload.target_type === "approval") {
    return "/admin/approvals";
  }

  if (payload.target_type === "transaction") {
    return admin ? "/admin/transactions" : "/user/coins";
  }

  return "";
};

const normalizeNotificationPayload = (payload, options = {}) => {
  const relatedSwap = normalizeTargetId(payload.related_swap);
  const targetType = payload.target_type || (relatedSwap ? "swap" : "");
  const targetId = normalizeTargetId(payload.target_id) || relatedSwap || null;
  const targetUrl = getDefaultTargetUrl(
    {
      ...payload,
      target_type: targetType,
      target_id: targetId,
      related_swap: relatedSwap,
    },
    options
  );

  return {
    user: payload.user || payload.recipient,
    type: payload.type,
    title: payload.title,
    body: payload.body || payload.message,
    related_swap: relatedSwap || undefined,
    target_type: targetType,
    target_id: targetId,
    target_url: targetUrl,
    is_read: Boolean(payload.is_read),
  };
};

const getNotificationPreferences = (user) => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  ...(user?.notification_preferences?.toObject
    ? user.notification_preferences.toObject()
    : user?.notification_preferences || {}),
});

const shouldCreateNotification = async (payload) => {
  const recipient = payload?.user || payload?.recipient;

  if (!recipient || !payload?.type) {
    return false;
  }

  const user = await User.findById(recipient).select("notification_preferences is_deleted");

  if (!user || user.is_deleted) {
    return false;
  }

  if (payload.bypass_preferences === true || BYPASS_PREFERENCES.has(payload.type)) {
    return true;
  }

  const preferenceKey = getPreferenceKey(payload);

  if (!preferenceKey) {
    return true;
  }

  return getNotificationPreferences(user)[preferenceKey] !== false;
};

const createNotification = async (payload) => {
  if (!(await shouldCreateNotification(payload))) {
    return null;
  }

  return Notification.create(normalizeNotificationPayload(payload));
};

const createNotifications = async (payloads) => {
  const results = await Promise.all(
    payloads.map(async (payload) => ((await shouldCreateNotification(payload)) ? payload : null))
  );
  const allowedPayloads = results.filter(Boolean);

  if (!allowedPayloads.length) {
    return [];
  }

  return Notification.create(allowedPayloads.map((payload) => normalizeNotificationPayload(payload)));
};

const notifyAdmins = async (payload) => {
  const admins = await User.find({ role: "admin", is_deleted: { $ne: true } }).select("_id");

  if (!admins.length) {
    return [];
  }

  return createNotifications(
    admins.map((admin) => ({
      ...payload,
      user: admin._id,
      target_url: getDefaultTargetUrl(payload, { admin: true }),
    }))
  );
};

module.exports = {
  BYPASS_PREFERENCES,
  createNotification,
  createNotifications,
  notifyAdmins,
};
