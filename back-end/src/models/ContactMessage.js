const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    inquiry_type: {
      type: String,
      enum: ["general", "dispute", "report", "billing", "technical"],
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["open", "in_review", "resolved", "dismissed"],
      default: "open",
    },
    admin_notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    user_reply: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    replied_at: {
      type: Date,
    },
    replied_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolved_at: {
      type: Date,
    },
    resolved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ inquiry_type: 1, createdAt: -1 });
contactMessageSchema.index({ user_id: 1, createdAt: -1 });

module.exports = mongoose.model("ContactMessage", contactMessageSchema);
