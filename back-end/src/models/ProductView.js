const mongoose = require("mongoose");

const productViewSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    viewer_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    guest_session_id: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

productViewSchema.index(
  { product_id: 1, viewer_user_id: 1 },
  {
    unique: true,
    partialFilterExpression: { viewer_user_id: { $type: "objectId" } },
  }
);

productViewSchema.index(
  { product_id: 1, guest_session_id: 1 },
  {
    unique: true,
    partialFilterExpression: { guest_session_id: { $type: "string" } },
  }
);

module.exports = mongoose.model("ProductView", productViewSchema);
