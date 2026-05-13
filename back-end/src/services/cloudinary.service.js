const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");
const logger = require("../config/logger");

const normalizeCloudinaryUrl = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (
    trimmed.length > 1 &&
    ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
};

const isCloudinaryConfigured = () => Boolean(normalizeCloudinaryUrl(process.env.CLOUDINARY_URL));

const createUploadError = () => {
  const error = new Error("Image upload failed");
  error.statusCode = 502;
  return error;
};

const sanitizeMessage = (message) => {
  const cloudinaryUrl = normalizeCloudinaryUrl(process.env.CLOUDINARY_URL);
  let sanitized = typeof message === "string" ? message : "";

  if (cloudinaryUrl) {
    sanitized = sanitized.split(cloudinaryUrl).join("[redacted]");
  }

  try {
    if (cloudinaryUrl) {
      const parsedUrl = new URL(cloudinaryUrl);
      [parsedUrl.username, parsedUrl.password].filter(Boolean).forEach((secret) => {
        sanitized = sanitized.split(secret).join("[redacted]");
        sanitized = sanitized.split(decodeURIComponent(secret)).join("[redacted]");
      });
    }
  } catch (_error) {
    // Ignore parsing failures while sanitizing diagnostics.
  }

  return sanitized
    .replace(/cloudinary:\/\/[^@\s]+@[^\s]+/gi, "cloudinary://[redacted]")
    .replace(/(api_key|api_secret|signature|token)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 300);
};

const getCloudinaryErrorDetails = (error) => {
  const cloudinaryError = error?.error || error || {};
  const statusCode = cloudinaryError.http_code || cloudinaryError.statusCode || cloudinaryError.status;
  const code = cloudinaryError.code || cloudinaryError.errno;
  const message = sanitizeMessage(cloudinaryError.message || error?.message || "Cloudinary upload failed");
  const lowerMessage = message.toLowerCase();
  const lowerCode = String(code || "").toLowerCase();

  let category = "upload";

  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("network") ||
    ["etimedout", "etimeout", "econnreset", "enotfound", "enetunreach", "eai_again"].includes(lowerCode)
  ) {
    category = "connection";
  } else if (
    statusCode === 401 ||
    statusCode === 403 ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("invalid api key") ||
    lowerMessage.includes("invalid signature") ||
    lowerMessage.includes("api secret")
  ) {
    category = "auth";
  }

  return {
    category,
    name: cloudinaryError.name || error?.name || "CloudinaryUploadError",
    http_code: statusCode || undefined,
    code: code || undefined,
    message,
  };
};

const logCloudinaryUploadFailure = (error, context = {}) => {
  const details = getCloudinaryErrorDetails(error);

  logger.warn(`[cloudinary] Image upload failed ${JSON.stringify({
    ...context,
    ...details,
  })}`);
};

const configureCloudinary = () => {
  const cloudinaryUrl = normalizeCloudinaryUrl(process.env.CLOUDINARY_URL);

  if (!cloudinaryUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(cloudinaryUrl);

    if (parsedUrl.protocol !== "cloudinary:") {
      const error = new Error("Invalid CLOUDINARY_URL protocol");
      error.code = "INVALID_CLOUDINARY_URL";
      throw error;
    }

    const cloudName = parsedUrl.hostname;
    const apiKey = decodeURIComponent(parsedUrl.username || "");
    const apiSecret = decodeURIComponent(parsedUrl.password || "");

    if (!cloudName || !apiKey || !apiSecret) {
      const error = new Error("Incomplete CLOUDINARY_URL configuration");
      error.code = "INVALID_CLOUDINARY_URL";
      throw error;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    return true;
  } catch (error) {
    throw error;
  }
};

const removeLocalFile = async (filePath) => {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
};

const assertReadableUploadFile = async (file) => {
  if (!file?.path) {
    const error = new Error("Upload file path is missing");
    error.code = "LOCAL_FILE_MISSING";
    throw error;
  }

  try {
    await fs.promises.access(file.path, fs.constants.R_OK);
  } catch (accessError) {
    const error = new Error("Upload file is not readable");
    error.code = accessError?.code || "LOCAL_FILE_UNREADABLE";
    throw error;
  }
};

const uploadImageFile = async (file, folder) => {
  try {
    configureCloudinary();
    await assertReadableUploadFile(file);

    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: "image",
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      secure: true,
    });

    if (!result?.secure_url) {
      throw createUploadError();
    }

    return {
      secure_url: result.secure_url,
      public_id: result.public_id || "",
    };
  } catch (error) {
    logCloudinaryUploadFailure(error, { folder });
    throw createUploadError();
  } finally {
    await removeLocalFile(file?.path);
  }
};

const uploadImageFiles = async (files, folder) => {
  const uploads = [];

  try {
    for (const file of files) {
      uploads.push(await uploadImageFile(file, folder));
    }
  } catch (error) {
    await Promise.all(files.map((file) => removeLocalFile(file?.path)));
    throw error;
  }

  return uploads;
};

module.exports = {
  isCloudinaryConfigured,
  uploadImageFiles,
};
