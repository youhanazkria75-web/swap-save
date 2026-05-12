const express = require("express");
const router = express.Router();

const userController = require("../controllers/user.controller");
const paymentController = require("../controllers/payment.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const optionalAuthMiddleware = require("../middlewares/optional-auth.middleware");
const { avatarUpload, validateUploadedImageFiles } = require("../middlewares/upload.middleware");

const uploadAvatar = (req, res, next) => {
  avatarUpload.single("avatar")(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      await validateUploadedImageFiles(req.file ? [req.file] : []);
      next();
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }
  });
};

router.get("/me", authMiddleware, userController.getMe);
router.get("/me/wallet", authMiddleware, userController.getWallet);
router.get("/me/wallet/packages", authMiddleware, paymentController.listCoinPackages);
router.post("/me/wallet/packages/checkout", authMiddleware, paymentController.createCoinPackageCheckout);
router.post("/me/wallet/extra-swap-slot", authMiddleware, userController.buyExtraSwapSlot);
router.post("/me/wallet/priority-matching", authMiddleware, userController.buyPriorityMatching);
router.post("/me/phone/send-code", authMiddleware, userController.sendPhoneVerificationCode);
router.post("/me/phone/verify-code", authMiddleware, userController.verifyPhoneVerificationCode);
router.patch("/me", authMiddleware, userController.updateMe);
router.post("/me/avatar", authMiddleware, uploadAvatar, userController.uploadAvatar);
router.patch("/me/password", authMiddleware, userController.updatePassword);
router.patch("/me/notification-preferences", authMiddleware, userController.updateNotificationPreferences);
router.patch("/me/security-preferences", authMiddleware, userController.updateSecurityPreferences);
router.delete("/me", authMiddleware, userController.deleteMe);
router.get("/:id", optionalAuthMiddleware, userController.getPublicProfile);

module.exports = router;
