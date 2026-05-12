const mongoose = require("mongoose");
const { getSwapServiceFeeEGP } = require("../config/serviceFees");

const swapRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    product_offered: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    product_requested: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    status: {
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
        "disputed"
      ],
      default: "pending"
    },

    admin_notes: {
      type: String,
      default: "",
      trim: true
    },

    admin_reviewed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    admin_reviewed_at: {
      type: Date
    },

    service_fee_requester: {
      type: Number,
      default: getSwapServiceFeeEGP
    },

    service_fee_receiver: {
      type: Number,
      default: getSwapServiceFeeEGP
    },

    requester_paid: {
      type: Boolean,
      default: false
    },

    receiver_paid: {
      type: Boolean,
      default: false
    },

    exchange_method: {
      type: String,
      enum: ["meetup", "delivery"]
    },

    meetup_details: {
      city: { type: String, default: "", trim: true },
      area: { type: String, default: "", trim: true },
      meeting_point: { type: String, default: "", trim: true },
      date: { type: String, default: "", trim: true },
      time: { type: String, default: "", trim: true },
      additional_notes: { type: String, default: "", trim: true }
    },

    delivery_details: {
      requester_pickup: {
        address: { type: String, default: "", trim: true },
        country: { type: String, default: "", trim: true },
        city: { type: String, default: "", trim: true },
        area: { type: String, default: "", trim: true },
        preferred_date: { type: String, default: "", trim: true },
        preferred_time: { type: String, default: "", trim: true },
        notes: { type: String, default: "", trim: true },
        submitted: { type: Boolean, default: false }
      },
      receiver_pickup: {
        address: { type: String, default: "", trim: true },
        country: { type: String, default: "", trim: true },
        city: { type: String, default: "", trim: true },
        area: { type: String, default: "", trim: true },
        preferred_date: { type: String, default: "", trim: true },
        preferred_time: { type: String, default: "", trim: true },
        notes: { type: String, default: "", trim: true },
        submitted: { type: Boolean, default: false }
      },
      fee_per_user: { type: Number, default: 100 },
      payment_method: {
        type: String,
        enum: ["cash_to_courier"],
        default: "cash_to_courier"
      },
      delivery_status: {
        type: String,
        enum: [
          "pending_pickup",
          "picked_up",
          "in_transit",
          "delivered_to_receiver",
          "delivery_completed"
        ],
        default: "pending_pickup"
      },
      tracking: {
        requester_item_picked_up: { type: Boolean, default: false },
        receiver_item_picked_up: { type: Boolean, default: false },
        delivered_to_requester: { type: Boolean, default: false },
        delivered_to_receiver: { type: Boolean, default: false }
      }
    },

    exchange_proposed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    exchange_accepted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    exchange_proposal_status: {
      type: String,
      enum: ["none", "pending", "accepted", "changes_requested"],
      default: "none"
    },

    requester_confirmed: {
      type: Boolean,
      default: false
    },

    receiver_confirmed: {
      type: Boolean,
      default: false
    },

    completed_at: {
      type: Date
    },

    compensation_amount: {
      type: Number,
      default: 0,
      min: 0
    },

    compensation_payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    compensation_receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    compensation_status: {
      type: String,
      enum: ["none", "proposed", "held", "released", "refunded", "rejected"],
      default: "none"
    },

    compensation_proposed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    compensation_accepted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    compensation_proposed_at: {
      type: Date
    },

    compensation_accepted_at: {
      type: Date
    },

    compensation_rejected_at: {
      type: Date
    }
  },
  { timestamps: true }
);

// ================= INDEXES =================
swapRequestSchema.index({ requester: 1 });
swapRequestSchema.index({ receiver: 1 });
swapRequestSchema.index({ status: 1 });
swapRequestSchema.index({ product_offered: 1, product_requested: 1 });

swapRequestSchema.post("save", async function releaseReservedProducts(doc) {
  if (!["rejected", "cancelled"].includes(doc.status)) {
    return;
  }

  const { releaseSwapProductsIfSafe } = require("../utils/swapCancellation");
  await releaseSwapProductsIfSafe(doc);
});

module.exports = mongoose.model("SwapRequest", swapRequestSchema);
