const mongoose = require("mongoose");

const swapTimelineEventSchema = new mongoose.Schema(
  {
    swap: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    actor: {
      type: String,
      enum: ["requester", "receiver", "admin", "system"],
      required: true,
    },
    actor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

swapTimelineEventSchema.index({ swap: 1, createdAt: 1 });

module.exports = mongoose.model("SwapTimelineEvent", swapTimelineEventSchema);
