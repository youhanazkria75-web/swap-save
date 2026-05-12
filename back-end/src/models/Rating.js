const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
  {
    swap: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SwapRequest",
      required: true,
    },
    rater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rated_user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    tags: {
      type: [String],
      default: [],
    },
    comment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

ratingSchema.index({ swap: 1, rater: 1 }, { unique: true });

module.exports = mongoose.model("Rating", ratingSchema);
