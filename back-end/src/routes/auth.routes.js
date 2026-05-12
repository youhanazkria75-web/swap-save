const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth.middleware");

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - first_name
 *               - last_name
 *               - email
 *               - password
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: Test
 *               last_name:
 *                 type: string
 *                 example: User
 *               email:
 *                 type: string
 *                 example: test1@mail.com
 *               password:
 *                 type: string
 *                 example: Password1!
 *               country:
 *                 type: string
 *                 example: Egypt
 *               city:
 *                 type: string
 *                 example: Cairo
 *               street_address:
 *                 type: string
 *                 example: 15 Abbas El Akkad
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 */
router.post("/register", authController.register);
router.get("/verify-email", authController.verifyEmail);
router.post("/resend-verification-email", authController.resendVerificationEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.get("/google", authController.startGoogleAuth);
router.get("/google/callback", authController.googleCallback);
router.get("/me", authMiddleware, authController.getMe);
router.put("/update-profile", authMiddleware, authController.updateProfile);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: test1@mail.com
 *               password:
 *                 type: string
 *                 example: Password1!
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 */
router.post("/login", authController.login);

module.exports = router;
