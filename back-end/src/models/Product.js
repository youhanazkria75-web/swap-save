const mongoose = require("mongoose");

const normalizeProductStatus = (status) =>
  status === "active" ? "available" : status;

const productSchema = new mongoose.Schema(
  {
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    category: { type: String, required: true, trim: true },
    condition: { type: String, required: true, trim: true },

    estimated_value: { type: Number, default: 0 },

    location: { type: String, default: "" },

    images: { type: [String], default: [] },
    subcategory: { type: String, default: "" },
    tags: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["available", "reserved", "swapped", "inactive", "rejected"],
      default: "available",
      set: normalizeProductStatus
    },
    is_featured: { type: Boolean, default: false },
    featured_until: { type: Date },
    priority_boosted_at: { type: Date },
    priority_boosted_until: { type: Date },
    view_count: { type: Number, default: 0 },
    saved_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.pre("validate", function normalizeLegacyActiveStatus() {
  this.status = normalizeProductStatus(this.status);
});

// ================= INDEXES =================
productSchema.index({ owner_id: 1 });
productSchema.index({ status: 1 });
productSchema.index({ category: 1 });
productSchema.index({ location: 1 });
productSchema.index({ priority_boosted_until: 1 });

module.exports = mongoose.model("Product", productSchema);
