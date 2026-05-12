require("dotenv").config();

const { validateStartupEnv } = require("./src/config/envValidation");

try {
  validateStartupEnv();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const app = require("./src/app");
const connectDB = require("./src/config/db");
const bootstrapAdmin = require("./src/config/bootstrapAdmin");
const migrateSwapStatuses = require("./src/utils/migrateSwapStatuses");
const { productUploadRoot, avatarUploadRoot } = require("./src/middlewares/upload.middleware");
const mongoose = require("mongoose");

let server;

const warnAboutLocalUploadsInProduction = () => {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_UPLOADS_PERSISTENCE_ACK !== "true"
  ) {
    console.warn(
      [
        "Production is using local disk uploads. Attach persistent storage for uploaded files",
        "or migrate to object storage before accepting real uploads.",
        `Set LOCAL_UPLOADS_PERSISTENCE_ACK=true after persistent storage is configured.`,
        `Product uploads: ${productUploadRoot}`,
        `Avatar uploads: ${avatarUploadRoot}`,
      ].join(" ")
    );
  }
};

// ================= START SERVER =================
const startServer = async () => {
  try {
    warnAboutLocalUploadsInProduction();
    await connectDB();
    await migrateSwapStatuses();
    await bootstrapAdmin();

    const PORT = process.env.PORT || 5000;

    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

// ================= GRACEFUL SHUTDOWN =================
const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);

  try {
    if (server) {
      server.close(async () => {
        await mongoose.connection.close();
        console.log("HTTP server closed.");
        console.log("MongoDB connection closed.");
        process.exit(0);
      });
    } else {
      await mongoose.connection.close();
      process.exit(0);
    }
  } catch (error) {
    console.error("Error during shutdown:", error.message);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();
