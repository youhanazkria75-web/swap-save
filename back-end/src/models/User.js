const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    address: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },
    phone_verification_last_sent_at: {
      type: Date,
      default: null,
    },
    phone_verification_send_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    phone_verification_send_count_date: {
      type: String,
      default: "",
      trim: true,
    },
    bio: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    country: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      default: "",
      trim: true,
    },
    area: {
      type: String,
      default: "",
      trim: true,
    },
    street_address: {
      type: String,
      default: "",
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
    saved_products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    rating_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    coins: {
      type: Number,
      default: 50,
      min: 0,
    },
    held_coins: {
      type: Number,
      default: 0,
      min: 0,
    },
    total_coins_earned: {
      type: Number,
      default: 0,
      min: 0,
    },
    total_coins_spent: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthly_free_swaps_used: {
      type: Number,
      default: 0,
      min: 0,
    },
    monthly_free_swaps_period: {
      type: String,
      default: "",
      trim: true,
    },
    extra_swap_slots: {
      type: Number,
      default: 0,
      min: 0,
    },
    priority_matches_available: {
      type: Number,
      default: 0,
      min: 0,
    },
    signup_bonus_granted: {
      type: Boolean,
      default: false,
      index: true,
    },
    phone_verification_reward_granted: {
      type: Boolean,
      default: false,
      index: true,
    },
    profile_complete_reward_granted: {
      type: Boolean,
      default: false,
      index: true,
    },
    two_factor_enabled: {
      type: Boolean,
      default: false,
    },
    login_alerts_enabled: {
      type: Boolean,
      default: true,
    },
    notification_preferences: {
      swap_requests_enabled: { type: Boolean, default: true },
      new_messages_enabled: { type: Boolean, default: true },
      admin_decisions_enabled: { type: Boolean, default: true },
      new_ratings_enabled: { type: Boolean, default: true },
      promotions_enabled: { type: Boolean, default: false },
      weekly_digest_enabled: { type: Boolean, default: true },
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model("User", userSchema);
