const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const swapController = require("../controllers/swap.controller");
const paymentController = require("../controllers/payment.controller");

/**
 * @swagger
 * /swaps:
 *   get:
 *     summary: Get all my swap requests
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Swap requests retrieved successfully
 */
router.get("/", authMiddleware, swapController.getMySwapRequests);

/**
 * @swagger
 * /swaps/sent:
 *   get:
 *     summary: Get swap requests I sent
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sent swaps retrieved successfully
 */
router.get("/sent", authMiddleware, swapController.getSentSwaps);

/**
 * @swagger
 * /swaps/received:
 *   get:
 *     summary: Get swap requests I received
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Received swaps retrieved successfully
 */
router.get("/received", authMiddleware, swapController.getReceivedSwaps);

/**
 * @swagger
 * /swaps/suggestions:
 *   get:
 *     summary: Get smart swap suggestions for my available products
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Smart swap suggestions retrieved successfully
 */
router.get("/suggestions", authMiddleware, swapController.getSwapSuggestions);

/**
 * @swagger
 * /swaps/request:
 *   post:
 *     summary: Create a new swap request
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_offered
 *               - product_requested
 *             properties:
 *               product_offered:
 *                 type: string
 *               product_requested:
 *                 type: string
 *     responses:
 *       201:
 *         description: Swap request created successfully
 */
router.post("/request", authMiddleware, swapController.createSwapRequest);

router.get("/:id/messages", authMiddleware, swapController.getSwapMessages);
router.post("/:id/messages", authMiddleware, swapController.createSwapMessage);
router.get("/:id/ratings", authMiddleware, swapController.getSwapRatings);
router.post("/:id/ratings", authMiddleware, swapController.createSwapRating);
router.post("/:id/reports", authMiddleware, swapController.createSwapReport);

/**
 * @swagger
 * /swaps/{id}/submit-review:
 *   post:
 *     summary: Submit a swap for admin review
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Swap submitted for admin review successfully
 */
router.post("/:id/submit-review", authMiddleware, swapController.submitForReview);
router.post("/:id/service-fee/checkout", authMiddleware, paymentController.createServiceFeeCheckout);
router.post("/:id/service-fee/reconcile", authMiddleware, paymentController.reconcileServiceFeeForSwap);
router.post("/:id/pay-service-fee", authMiddleware, swapController.payServiceFee);
router.patch("/:id/cancel", authMiddleware, swapController.cancelSwapRequest);
router.post("/:id/compensation/propose", authMiddleware, swapController.proposeCompensation);
router.post("/:id/compensation/accept", authMiddleware, swapController.acceptCompensation);
router.post("/:id/compensation/reject", authMiddleware, swapController.rejectCompensation);
router.post("/:id/exchange-method", authMiddleware, swapController.setExchangeMethod);
router.post("/:id/exchange-method/accept", authMiddleware, swapController.acceptExchangeMethod);
router.post("/:id/exchange-method/request-changes", authMiddleware, swapController.requestExchangeChanges);
router.post("/:id/confirm-completion", authMiddleware, swapController.confirmCompletion);
router.patch("/:id/confirm-completion", authMiddleware, swapController.confirmCompletion);

/**
 * @swagger
 * /swaps/{id}:
 *   get:
 *     summary: Get one swap request
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Swap request retrieved successfully
 *       404:
 *         description: Swap request not found
 */
router.get("/:id", authMiddleware, swapController.getSwapById);

/**
 * @swagger
 * /swaps/{id}/accept:
 *   patch:
 *     summary: Accept a swap request
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Swap accepted successfully
 */
router.patch("/:id/accept", authMiddleware, swapController.acceptSwapRequest);

/**
 * @swagger
 * /swaps/{id}/reject:
 *   patch:
 *     summary: Reject a swap request
 *     tags: [Swaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Swap rejected successfully
 */
router.patch("/:id/reject", authMiddleware, swapController.rejectSwapRequest);

module.exports = router;
