const { body, validationResult } = require("express-validator");

const ALLOWED_PRODUCT_CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home & Garden",
  "Sports & Outdoors",
  "Books & Media",
  "Vehicles",
  "Kids & Baby",
  "Art & Collectibles",
];

const ALLOWED_PRODUCT_CONDITIONS = ["new", "like-new", "good", "fair", "poor"];
const PRODUCT_TITLE_MIN_LENGTH = 3;
const PRODUCT_DESCRIPTION_MIN_LENGTH = 10;
const PRODUCT_IMAGES_MAX_COUNT = 5;

const isString = (value) => typeof value === "string";

const isPositiveFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
};

const isValidProductImages = (images) =>
  Array.isArray(images) &&
  images.length > 0 &&
  images.length <= PRODUCT_IMAGES_MAX_COUNT &&
  images.every((image) => typeof image === "string" && image.trim().length > 0);

const trimStringArray = (values) =>
  Array.isArray(values) ? values.map((value) => (typeof value === "string" ? value.trim() : value)) : values;

const decodeCategoryEntities = (value) =>
  typeof value === "string" ? value.replace(/&amp;/g, "&") : value;

const titleValidator = (fieldName = "title", { required = false } = {}) => {
  const chain = body(fieldName);

  if (required) {
    chain.exists({ checkNull: true }).withMessage(`${fieldName} is required`).bail();
  } else {
    chain.optional();
  }

  return chain
    .custom(isString)
    .withMessage(`${fieldName} must be a string`)
    .bail()
    .trim()
    .isLength({ min: PRODUCT_TITLE_MIN_LENGTH })
    .withMessage(`${fieldName} must be at least ${PRODUCT_TITLE_MIN_LENGTH} characters`);
};

const descriptionValidator = ({ required = false } = {}) => {
  const chain = body("description");

  if (required) {
    chain.exists({ checkNull: true }).withMessage("description is required").bail();
  } else {
    chain.optional();
  }

  return chain
    .custom(isString)
    .withMessage("description must be a string")
    .bail()
    .trim()
    .isLength({ min: PRODUCT_DESCRIPTION_MIN_LENGTH })
    .withMessage(`description must be at least ${PRODUCT_DESCRIPTION_MIN_LENGTH} characters`);
};

const categoryValidator = ({ required = false } = {}) => {
  const chain = body("category");

  if (required) {
    chain.exists({ checkNull: true }).withMessage("category is required").bail();
  } else {
    chain.optional();
  }

  return chain
    .custom(isString)
    .withMessage("category must be a string")
    .bail()
    .trim()
    .customSanitizer(decodeCategoryEntities)
    .isIn(ALLOWED_PRODUCT_CATEGORIES)
    .withMessage(`category must be one of: ${ALLOWED_PRODUCT_CATEGORIES.join(", ")}`);
};

const conditionValidator = ({ required = false } = {}) => {
  const chain = body("condition");

  if (required) {
    chain.exists({ checkNull: true }).withMessage("condition is required").bail();
  } else {
    chain.optional();
  }

  return chain
    .custom(isString)
    .withMessage("condition must be a string")
    .bail()
    .trim()
    .isIn(ALLOWED_PRODUCT_CONDITIONS)
    .withMessage(`condition must be one of: ${ALLOWED_PRODUCT_CONDITIONS.join(", ")}`);
};

const estimatedValueValidator = ({ required = false } = {}) => {
  const chain = body("estimated_value");

  if (required) {
    chain.exists({ checkNull: true }).withMessage("estimated_value is required").bail();
  } else {
    chain.optional();
  }

  return chain
    .custom(isPositiveFiniteNumber)
    .withMessage("estimated_value must be a positive number")
    .bail()
    .customSanitizer((value) => Number(value));
};

const imagesValidator = ({ required = false } = {}) => {
  const chain = body("images");

  if (required) {
    chain.exists({ checkNull: true }).withMessage("At least one product image is required").bail();
  } else {
    chain.optional();
  }

  return chain
    .custom(isValidProductImages)
    .withMessage(`images must include 1 to ${PRODUCT_IMAGES_MAX_COUNT} non-empty image URLs`)
    .bail()
    .customSanitizer(trimStringArray);
};

// middleware عام لإظهار أخطاء الـ validation
exports.handleValidation = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  next();
};

// validation عند إنشاء منتج
exports.validateCreateProduct = [
  titleValidator("title", { required: true }),
  descriptionValidator({ required: true }),
  categoryValidator({ required: true }),
  conditionValidator({ required: true }),
  estimatedValueValidator({ required: true }),
  imagesValidator({ required: true }),

  body("location")
    .optional()
    .isString()
    .withMessage("location must be a string"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("tags must be an array"),

  body("is_featured")
    .optional()
    .isBoolean()
    .withMessage("is_featured must be a boolean"),
];

// validation عند تعديل منتج
exports.validateUpdateProduct = [
  titleValidator(),
  descriptionValidator(),
  categoryValidator(),
  conditionValidator(),
  estimatedValueValidator(),
  imagesValidator(),

  body("location")
    .optional()
    .isString()
    .withMessage("location must be a string"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("tags must be an array"),

  body("is_featured")
    .optional()
    .isBoolean()
    .withMessage("is_featured must be a boolean"),
];
