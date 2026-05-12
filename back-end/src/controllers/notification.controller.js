const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");
const mongoose = require("mongoose");

const getId = (value) => {
  if (!value) return "";
  return String(value._id || value.id || value);
};

const resolveTargetUrl = (notification) => {
  if (notification.target_url) {
    return notification.target_url;
  }

  const swapId = getId(notification.related_swap);

  if (swapId) {
    return `/user/swaps/${swapId}`;
  }

  return "";
};

const serializeNotification = (notification) => {
  const source = notification && typeof notification.toObject === "function"
    ? notification.toObject()
    : notification;

  if (!source) {
    return null;
  }

  const targetUrl = resolveTargetUrl(source);
  const relatedSwapId = getId(source.related_swap);

  return {
    id: String(source._id),
    _id: source._id,
    user: source.user,
    recipient: source.user,
    type: source.type,
    title: source.title,
    body: source.body,
    message: source.body,
    is_read: Boolean(source.is_read),
    target_type: source.target_type || (relatedSwapId ? "swap" : ""),
    target_id: source.target_id || source.related_swap || null,
    target_url: targetUrl,
    related_swap: source.related_swap || null,
    createdAt: source.createdAt,
  };
};

const getLimit = (value) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 100);
};

exports.getNotifications = asyncHandler(async (req, res) => {
  const limit = getLimit(req.query.limit);
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit),
    Notification.countDocuments({ user: req.userId, is_read: false }),
  ]);

  return res.json({
    notifications: notifications.map(serializeNotification).filter(Boolean),
    unread_count: unreadCount,
  });
});

exports.getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    user: req.userId,
    is_read: false,
  });

  return res.json({ unread_count: unreadCount });
});

exports.markNotificationRead = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Notification not found" });
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },
    { is_read: true },
    { returnDocument: "after" }
  );

  if (!notification) {
    return res.status(404).json({ message: "Notification not found" });
  }

  const unreadCount = await Notification.countDocuments({
    user: req.userId,
    is_read: false,
  });

  return res.json({
    notification: serializeNotification(notification),
    unread_count: unreadCount,
  });
});

exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.userId, is_read: false },
    { $set: { is_read: true } }
  );

  return res.json({
    modified_count: result.modifiedCount || 0,
    unread_count: 0,
  });
});
