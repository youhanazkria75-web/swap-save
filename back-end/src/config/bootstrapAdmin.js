const bcrypt = require("bcryptjs");
const User = require("../models/User");
const logger = require("./logger");

const DEFAULT_ADMIN_EMAIL = "admin@swap-save.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";

const WEAK_PRODUCTION_ADMIN_PASSWORDS = new Set([
  DEFAULT_ADMIN_PASSWORD,
  "admin",
  "password",
  "password123",
  "123456",
  "123456789",
  "swap-save",
  "swapandsave",
  "changeme",
  "change_me",
  "change_me_to_a_strong_unique_password",
]);

const normalizeAdminEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const getEnvPassword = (value) => (typeof value === "string" ? value : "");

const isWeakProductionAdminPassword = (password) => {
  const normalizedPassword = getEnvPassword(password).trim().toLowerCase();

  return (
    WEAK_PRODUCTION_ADMIN_PASSWORDS.has(normalizedPassword) ||
    /^\d+$/.test(normalizedPassword) ||
    normalizedPassword.includes("password") ||
    normalizedPassword.includes("admin123") ||
    normalizedPassword.includes("swap-save")
  );
};

const getBootstrapAdminConfig = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredAdminEmail = normalizeAdminEmail(process.env.ADMIN_EMAIL);
  const configuredAdminPassword = getEnvPassword(process.env.ADMIN_PASSWORD);

  const adminEmail = configuredAdminEmail || DEFAULT_ADMIN_EMAIL;
  const adminPassword = configuredAdminPassword || DEFAULT_ADMIN_PASSWORD;

  if (isProduction) {
    if (!configuredAdminEmail) {
      throw new Error(
        "Production bootstrap admin requires ADMIN_EMAIL. Set a real admin email before starting the server."
      );
    }

    if (!configuredAdminPassword) {
      throw new Error(
        "Production bootstrap admin requires ADMIN_PASSWORD. Set a strong unique password before starting the server."
      );
    }

    if (adminEmail === DEFAULT_ADMIN_EMAIL) {
      throw new Error(
        `Production ADMIN_EMAIL must not use the default value ${DEFAULT_ADMIN_EMAIL}.`
      );
    }

    if (adminPassword.length < 12) {
      throw new Error("Production ADMIN_PASSWORD must be at least 12 characters long.");
    }

    if (isWeakProductionAdminPassword(adminPassword)) {
      throw new Error(
        "Production ADMIN_PASSWORD must be a strong unique value, not an obvious/default password."
      );
    }
  }

  return {
    adminEmail,
    adminPassword,
    adminFirstName: process.env.ADMIN_FIRST_NAME || "System",
    adminLastName: process.env.ADMIN_LAST_NAME || "Admin",
  };
};

const bootstrapAdmin = async () => {
  const {
    adminEmail,
    adminPassword,
    adminFirstName,
    adminLastName,
  } = getBootstrapAdminConfig();

  try {
    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      if (!existingAdmin.isEmailVerified) {
        existingAdmin.isEmailVerified = true;
        existingAdmin.emailVerificationToken = null;
        existingAdmin.emailVerificationExpires = null;
        await existingAdmin.save();
      }
      logger.info(`Admin already exists: ${existingAdmin.email}`);
      return;
    }

    const existingUserWithEmail = await User.findOne({ email: adminEmail });

    if (existingUserWithEmail) {
      existingUserWithEmail.role = "admin";
      existingUserWithEmail.isEmailVerified = true;
      existingUserWithEmail.emailVerificationToken = null;
      existingUserWithEmail.emailVerificationExpires = null;
      await existingUserWithEmail.save();

      logger.info(`Existing user promoted to admin: ${existingUserWithEmail.email}`);
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const adminUser = await User.create({
      first_name: adminFirstName,
      last_name: adminLastName,
      email: adminEmail,
      password: hashedPassword,
      address: "",
      role: "admin",
      isEmailVerified: true,
    });

    logger.info(`Bootstrap admin created: ${adminUser.email}`);
  } catch (error) {
    logger.error(`Bootstrap admin failed: ${error.message}`);
  }
};

module.exports = bootstrapAdmin;
module.exports.getBootstrapAdminConfig = getBootstrapAdminConfig;
module.exports.isWeakProductionAdminPassword = isWeakProductionAdminPassword;
