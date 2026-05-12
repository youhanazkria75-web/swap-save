const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const notificationController = require("../controllers/notification.controller");

router.get("/", authMiddleware, notificationController.getNotifications);
router.get("/unread-count", authMiddleware, notificationController.getUnreadCount);
router.patch("/read-all", authMiddleware, notificationController.markAllNotificationsRead);
router.patch("/:id/read", authMiddleware, notificationController.markNotificationRead);

module.exports = router;
