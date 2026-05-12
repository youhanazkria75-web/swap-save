const mongoose = require("mongoose");
const ContactMessage = require("../models/ContactMessage");
const asyncHandler = require("../utils/asyncHandler");
const { createNotification, notifyAdmins } = require("../utils/notifications");

const INQUIRY_TYPES = ["general", "dispute", "report", "billing", "technical"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getString = (value) => (typeof value === "string" ? value.trim() : "");

const getContactPayload = (body) => ({
  fullName: getString(body.fullName ?? body.full_name),
  email: getString(body.email).toLowerCase(),
  inquiryType: getString(body.inquiryType ?? body.inquiry_type),
  subject: getString(body.subject),
  message: getString(body.message),
});

const validateContactPayload = (payload) => {
  const errors = [];

  if (!payload.fullName) {
    errors.push({ path: "fullName", msg: "Full name is required" });
  } else if (payload.fullName.length > 120) {
    errors.push({ path: "fullName", msg: "Full name cannot exceed 120 characters" });
  }

  if (!payload.email) {
    errors.push({ path: "email", msg: "Email is required" });
  } else if (!EMAIL_PATTERN.test(payload.email)) {
    errors.push({ path: "email", msg: "Enter a valid email address" });
  } else if (payload.email.length > 254) {
    errors.push({ path: "email", msg: "Email cannot exceed 254 characters" });
  }

  if (!payload.inquiryType) {
    errors.push({ path: "inquiryType", msg: "Inquiry type is required" });
  } else if (!INQUIRY_TYPES.includes(payload.inquiryType)) {
    errors.push({ path: "inquiryType", msg: "Invalid inquiry type" });
  }

  if (!payload.subject) {
    errors.push({ path: "subject", msg: "Subject is required" });
  } else if (payload.subject.length > 180) {
    errors.push({ path: "subject", msg: "Subject cannot exceed 180 characters" });
  }

  if (!payload.message) {
    errors.push({ path: "message", msg: "Message is required" });
  } else if (payload.message.length > 5000) {
    errors.push({ path: "message", msg: "Message cannot exceed 5000 characters" });
  }

  return errors;
};

const serializeSubmittedContactMessage = (message) => {
  const source = message && typeof message.toObject === "function" ? message.toObject() : message;

  if (!source) {
    return null;
  }

  return {
    _id: source._id,
    id: String(source._id),
    full_name: source.full_name || "",
    email: source.email || "",
    inquiry_type: source.inquiry_type,
    subject: source.subject || "",
    message: source.message || "",
    user_id: source.user_id,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
};

exports.createContactMessage = asyncHandler(async (req, res) => {
  const payload = getContactPayload(req.body || {});
  const errors = validateContactPayload(payload);

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  const contactMessage = await ContactMessage.create({
    full_name: payload.fullName,
    email: payload.email,
    inquiry_type: payload.inquiryType,
    subject: payload.subject,
    message: payload.message,
    user_id: mongoose.isValidObjectId(req.userId) ? req.userId : undefined,
  });

  await Promise.all([
    notifyAdmins({
      type: "system",
      title: "New support message",
      body: `${payload.inquiryType} inquiry: ${payload.subject}`,
      target_type: "support",
      target_id: contactMessage._id,
      target_url: "/admin/support",
    }),
    contactMessage.user_id
      ? createNotification({
          user: contactMessage.user_id,
          type: "system",
          title: "Support message received",
          body: "Your message was submitted and is available for admin review.",
        })
      : Promise.resolve(null),
  ]);

  return res.status(201).json({
    message: "Contact message submitted successfully",
    contact_message: serializeSubmittedContactMessage(contactMessage),
  });
});
