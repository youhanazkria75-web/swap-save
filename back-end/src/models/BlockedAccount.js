const mongoose = require("mongoose");

const blockedAccountSchema = new mongoose.Schema(
  {
    email_hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    blocked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    blocked_at: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BlockedAccount", blockedAccountSchema);
