const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get admin dashboard statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin stats retrieved successfully
 *       403:
 *         description: Admin access only
 */
router.get("/stats", authMiddleware, adminMiddleware, adminController.getAdminStats);
router.get("/suspicious-activity", authMiddleware, adminMiddleware, adminController.getSuspiciousActivity);
router.get("/users", authMiddleware, adminMiddleware, adminController.getAdminUsers);
router.delete("/users/:id", authMiddleware, adminMiddleware, adminController.removeAdminUserFromPlatform);
router.get("/products", authMiddleware, adminMiddleware, adminController.getAdminProducts);
router.patch("/products/:id", authMiddleware, adminMiddleware, adminController.updateAdminProduct);
router.get("/transactions", authMiddleware, adminMiddleware, adminController.getAdminTransactions);
router.post("/transactions/adjust", authMiddleware, adminMiddleware, adminController.adjustUserCoins);
router.get("/reports", authMiddleware, adminMiddleware, adminController.getReports);
router.patch("/reports/:id/resolve", authMiddleware, adminMiddleware, adminController.resolveReport);
router.get("/contact-messages", authMiddleware, adminMiddleware, adminController.getContactMessages);
router.patch("/contact-messages/:id/status", authMiddleware, adminMiddleware, adminController.updateContactMessageStatus);
router.get("/swaps", authMiddleware, adminMiddleware, adminController.getAdminSwaps);
router.get("/swaps/:id/messages", authMiddleware, adminMiddleware, adminController.getAdminSwapMessages);
router.patch("/swaps/:id/approve", authMiddleware, adminMiddleware, adminController.approveSwap);
router.patch("/swaps/:id/reject", authMiddleware, adminMiddleware, adminController.rejectSwap);
router.patch("/swaps/:id/cancel", authMiddleware, adminMiddleware, adminController.cancelSwap);
router.patch("/swaps/:id/delivery-tracking", authMiddleware, adminMiddleware, adminController.updateDeliveryTracking);
router.get("/swaps/:id", authMiddleware, adminMiddleware, adminController.getAdminSwapById);

module.exports = router;
