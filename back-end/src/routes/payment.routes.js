const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/payment.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

const paymentToolAccess = (req, res, next) => {
  const devToken = process.env.PAYMENT_DEV_TOKEN;
  const isDevTokenAllowed = process.env.NODE_ENV !== "production" && devToken;

  if (isDevTokenAllowed && req.get("x-payment-dev-token") === devToken) {
    return next();
  }

  return authMiddleware(req, res, (authError) => {
    if (authError) return next(authError);
    return adminMiddleware(req, res, next);
  });
};

router.post("/paymob/webhook", paymentController.handlePaymobWebhook);
router.post("/paymob/confirm-return", authMiddleware, paymentController.confirmPaymobReturn);
router.post("/paymob/reconcile/:transactionId", paymentToolAccess, paymentController.reconcilePaymobPayment);
router.post("/paymob/expire-pending", paymentToolAccess, paymentController.expireStalePaymobPendingPurchases);

module.exports = router;
