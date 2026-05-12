const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    swap: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
      default: null,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "signup_bonus",
        "coin_hold",
        "coin_release",
        "coin_credit",
        "coin_refund",
        "feature_product",
        "extra_swap_slot",
        "priority_matching",
        "swap_completion_reward",
        "phone_verification_reward",
        "profile_complete_reward",
        "admin_adjustment",
        "package_purchase_pending",
        "package_purchase_completed",
        "service_fee",
      ],
      required: true,
    },
    direction: {
      type: String,
      enum: ["debit", "credit", "hold", "release", "refund", "adjustment"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      enum: ["coins", "EGP"],
      default: "coins",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "refunded", "failed", "expired"],
      default: "pending",
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

transactionSchema.index(
  { user: 1, swap: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "swap_completion_reward" },
  }
);

transactionSchema.index(
  { user: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [
        { type: "phone_verification_reward" },
        { type: "profile_complete_reward" },
      ],
    },
  }
);

transactionSchema.index({ "metadata.paymobOrderId": 1 }, { sparse: true });
transactionSchema.index({ "metadata.paymobTransactionId": 1 }, { sparse: true });
transactionSchema.index({ "metadata.merchantOrderId": 1 }, { sparse: true });
transactionSchema.index({ "metadata.paymob_order_id": 1 }, { sparse: true });
transactionSchema.index({ "metadata.paymob_transaction_id": 1 }, { sparse: true });
transactionSchema.index({ "metadata.merchant_order_id": 1 }, { sparse: true });

module.exports = mongoose.model("Transaction", transactionSchema);
