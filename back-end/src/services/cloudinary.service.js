const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");

const isCloudinaryConfigured = () => Boolean(process.env.CLOUDINARY_URL?.trim());

const createUploadError = () => {
  const error = new Error("Image upload failed");
  error.statusCode = 502;
  return error;
};

const removeLocalFile = async (filePath) => {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
};

const uploadImageFile = async (file, folder) => {
  try {
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
  } catch (_error) {
    throw createUploadError();
  } finally {
    await removeLocalFile(file.path);
  }
};

const uploadImageFiles = async (files, folder) => {
  const uploads = [];

  for (const file of files) {
    uploads.push(await uploadImageFile(file, folder));
  }

  return uploads;
};

module.exports = {
  isCloudinaryConfigured,
  uploadImageFiles,
};
