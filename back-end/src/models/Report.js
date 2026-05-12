const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    swap: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
    },
    target_type: {
      type: String,
      enum: ["swap", "message", "product", "user"],
      required: true,
    },
    target_id: {
      type: mongoose.Schema.Types.ObjectId,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["open", "under_review", "resolved", "dismissed"],
      default: "open",
    },
    previous_swap_status: {
      type: String,
      enum: [
        "pending",
        "in_discussion",
        "under_review",
        "approved",
        "payment_pending",
        "exchange_setup",
        "in_progress",
        "completed",
        "rejected",
        "cancelled",
        "disputed",
      ],
    },
    resolution_action: {
      type: String,
      enum: ["dismiss", "resolve", "cancel_swap", "continue_swap"],
    },
    admin_notes: {
      type: String,
      default: "",
      trim: true,
    },
    resolved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolved_at: {
      type: Date,
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ swap: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ resolution_action: 1, updatedAt: -1 });

module.exports = mongoose.model("Report", reportSchema);
