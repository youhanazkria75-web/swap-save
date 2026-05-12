const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    swap: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "system"],
      default: "text",
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    is_admin_visible: {
      type: Boolean,
      default: true,
    },
    is_reported: {
      type: Boolean,
      default: false,
    },
    report_reason: {
      type: String,
    },
    read_by: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true }
);

messageSchema.index({ swap: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
