const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "swap-request",
        "swap-accepted",
        "swap-approved",
        "swap-rejected",
        "swap-completed",
        "message",
        "payment",
        "rating",
        "system",
        "delivery",
        "report",
        "promotion",
        "weekly-digest",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    related_swap: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
    },
    target_type: {
      type: String,
      trim: true,
      default: "",
    },
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    target_url: {
      type: String,
      trim: true,
      default: "",
    },
    is_read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, is_read: 1, createdAt: -1 });
notificationSchema.index({ target_type: 1, target_id: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
