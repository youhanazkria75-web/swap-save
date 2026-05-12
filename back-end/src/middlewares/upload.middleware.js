const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const productUploadRoot = path.join(__dirname, "../../uploads/products");
const avatarUploadRoot = path.join(__dirname, "../../uploads/avatars");

fs.mkdirSync(productUploadRoot, { recursive: true });
fs.mkdirSync(avatarUploadRoot, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const createStorage = (destination) => multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error("Only JPG, PNG, WEBP, and GIF images are allowed"));
  }

  const extension = path.extname(file.originalname || "").toLowerCase();
  if (!allowedExtensions.has(extension)) {
    return cb(new Error("Invalid image file extension"));
  }

  cb(null, true);
};

const hasImageSignature = (buffer, mimetype) => {
  if (!buffer || buffer.length < 4) {
    return false;
  }

  if (mimetype === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimetype === "image/png") {
    return buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
  }

  if (mimetype === "image/gif") {
    const signature = buffer.slice(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  if (mimetype === "image/webp") {
    return buffer.length >= 12 &&
      buffer.slice(0, 4).toString("ascii") === "RIFF" &&
      buffer.slice(8, 12).toString("ascii") === "WEBP";
  }

  return false;
};

const deleteUploadedFiles = async (files) => {
  await Promise.all(
    files
      .filter((file) => file?.path)
      .map((file) => fs.promises.unlink(file.path).catch(() => {}))
  );
};

const validateUploadedImageFiles = async (files = []) => {
  for (const file of files) {
    const handle = await fs.promises.open(file.path, "r");
    let valid = false;

    try {
      const buffer = Buffer.alloc(12);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      valid = hasImageSignature(buffer.slice(0, bytesRead), file.mimetype);
    } finally {
      await handle.close();
    }

    if (!valid) {
      await deleteUploadedFiles(files);
      const error = new Error("Invalid image file content");
      error.statusCode = 400;
      throw error;
    }
  }
};

const productImageUpload = multer({
  storage: createStorage(productUploadRoot),
  fileFilter,
  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
  },
});

const avatarUpload = multer({
  storage: createStorage(avatarUploadRoot),
  fileFilter,
  limits: {
    files: 1,
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = {
  productImageUpload,
  avatarUpload,
  validateUploadedImageFiles,
  uploadRoot: productUploadRoot,
  productUploadRoot,
  avatarUploadRoot,
};
