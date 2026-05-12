const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/auth.middleware");
const optionalAuthMiddleware = require("../middlewares/optional-auth.middleware");
const productController = require("../controllers/product.controller");
const { productImageUpload, validateUploadedImageFiles } = require("../middlewares/upload.middleware");

const {
  validateCreateProduct,
  validateUpdateProduct,
  handleValidation,
} = require("../middlewares/validation.middleware");

const uploadProductImages = (req, res, next) => {
  productImageUpload.array("images", 5)(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      await validateUploadedImageFiles(Array.isArray(req.files) ? req.files : []);
      next();
    } catch (validationError) {
      return res.status(400).json({ message: validationError.message });
    }
  });
};

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get all available products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: List of available products
 */
router.get("/", optionalAuthMiddleware, productController.getAllProducts);

/**
 * @swagger
 * /products/recommendations/{productId}:
 *   get:
 *     summary: Get recommended products based on a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Recommended products retrieved successfully
 *       404:
 *         description: Base product not found
 */
router.get(
  "/recommendations",
  authMiddleware,
  productController.getUserRecommendations
);

router.get(
  "/recommendations/:productId",
  authMiddleware,
  productController.getRecommendedProducts
);

/**
 * @swagger
 * /products/mine:
 *   get:
 *     summary: Get my products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My products retrieved successfully
 */
router.get("/mine", authMiddleware, productController.getMyProducts);
router.get("/saved", authMiddleware, productController.getSavedProducts);
router.get("/category-counts", productController.getCategoryCounts);
router.get("/home-summary", productController.getHomeSummary);
router.get("/featured", optionalAuthMiddleware, productController.getFeaturedProducts);
router.get("/:id/public", optionalAuthMiddleware, productController.getPublicProductById);
router.post("/:id/view", optionalAuthMiddleware, productController.incrementProductView);
router.post("/:id/save", authMiddleware, productController.toggleSavedProduct);
router.post("/:id/feature", authMiddleware, productController.featureProduct);
router.post("/:id/priority-boost", authMiddleware, productController.applyPriorityBoost);
router.post("/:id/reports", authMiddleware, productController.reportProduct);
router.get("/:id", authMiddleware, productController.getProductById);

router.post(
  "/upload",
  authMiddleware,
  uploadProductImages,
  productController.uploadProductImages
);

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - category
 *               - condition
 *             properties:
 *               title:
 *                 type: string
 *                 example: iPhone 11
 *               description:
 *                 type: string
 *                 example: Good condition
 *               category:
 *                 type: string
 *                 example: Electronics
 *               condition:
 *                 type: string
 *                 example: Used
 *               estimated_value:
 *                 type: number
 *                 example: 9000
 *               location:
 *                 type: string
 *                 example: Cairo
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation failed
 */
router.post(
  "/",
  authMiddleware,
  validateCreateProduct,
  handleValidation,
  productController.createProduct
);

/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               condition:
 *                 type: string
 *               estimated_value:
 *                 type: number
 *               location:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         description: Product not found
 */
router.put(
  "/:id",
  authMiddleware,
  validateUpdateProduct,
  handleValidation,
  productController.updateProduct
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 */
router.delete("/:id", authMiddleware, productController.deleteProduct);

module.exports = router;
