const Product = require("../models/Product");
const Transaction = require("../models/Transaction");

const ACTIVE_SWAP_PRODUCT_LOCK_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
  "disputed",
];

const USER_CANCELLABLE_SWAP_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
];

const ADMIN_CANCELLABLE_SWAP_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
  "disputed",
];

const getId = (value) => {
  if (!value) return "";
  return String(value._id || value.id || value);
};

const getSwapRequestModel = () => require("../models/SwapRequest");

const getSwapProductIds = (swap) =>
  [...new Set([getId(swap?.product_offered), getId(swap?.product_requested)].filter(Boolean))];

const releaseSwapProductsIfSafe = async (swap) => {
  const SwapRequest = getSwapRequestModel();
  const productIds = getSwapProductIds(swap);
  const swapId = getId(swap);
  const releasedProductIds = [];
  const retainedProductIds = [];

  for (const productId of productIds) {
    const otherActiveSwap = await SwapRequest.exists({
      _id: { $ne: swapId },
      status: { $in: ACTIVE_SWAP_PRODUCT_LOCK_STATUSES },
      $or: [{ product_offered: productId }, { product_requested: productId }],
    });

    if (otherActiveSwap) {
      retainedProductIds.push(productId);
      continue;
    }

    const result = await Product.updateOne(
      { _id: productId, status: "reserved" },
      { $set: { status: "available" } }
    );

    if (result.modifiedCount > 0) {
      releasedProductIds.push(productId);
    }
  }

  return {
    releasedProductIds,
    retainedProductIds,
  };
};

const expirePendingServiceFeeTransactions = async (
  swap,
  {
    actor = "system",
    actorId = "",
    reason = "Pending service fee checkout expired because the swap was cancelled.",
  } = {}
) => {
  const now = new Date();
  const metadataUpdate = {
    "metadata.cancelledWithSwap": true,
    "metadata.serviceFeeExpiredAt": now,
    "metadata.serviceFeeExpiryReason": reason,
    "metadata.serviceFeeExpiredByActor": actor,
  };

  if (actorId) {
    metadataUpdate["metadata.serviceFeeExpiredBy"] = String(actorId);
  }

  return Transaction.updateMany(
    {
      swap: getId(swap),
      type: "service_fee",
      status: "pending",
    },
    {
      $set: {
        status: "expired",
        description: reason,
        ...metadataUpdate,
      },
    }
  );
};

const getCompletedServiceFeePaymentSummary = async (swap) => {
  const completedTransactionCount = await Transaction.countDocuments({
    swap: getId(swap),
    type: "service_fee",
    status: "completed",
  });

  const requesterPaid = Boolean(swap?.requester_paid);
  const receiverPaid = Boolean(swap?.receiver_paid);

  return {
    requesterPaid,
    receiverPaid,
    completedTransactionCount,
    anyPaid: requesterPaid || receiverPaid || completedTransactionCount > 0,
  };
};

module.exports = {
  ACTIVE_SWAP_PRODUCT_LOCK_STATUSES,
  ADMIN_CANCELLABLE_SWAP_STATUSES,
  USER_CANCELLABLE_SWAP_STATUSES,
  expirePendingServiceFeeTransactions,
  getCompletedServiceFeePaymentSummary,
  releaseSwapProductsIfSafe,
};
