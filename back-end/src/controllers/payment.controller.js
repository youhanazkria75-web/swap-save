const Transaction = require("../models/Transaction");
const SwapRequest = require("../models/SwapRequest");
const User = require("../models/User");
const logger = require("../config/logger");
const asyncHandler = require("../utils/asyncHandler");
const {
  createWalletNotification,
  getWalletSummary,
  serializeTransaction,
} = require("../utils/wallet");
const {
  COIN_PACKAGES,
  getCoinPackage,
  serializeCoinPackage,
} = require("../config/coinPackages");
const {
  SERVICE_FEE_CURRENCY,
  getSwapServiceFeeEGP,
} = require("../config/serviceFees");
const {
  createPaymobCheckoutSession,
  fetchPaymobPaymentStatus,
  getPaymobCurrency,
  getPaymobEventObject,
  verifyPaymobHmac,
} = require("../services/paymob.service");
const { createNotification, createNotifications } = require("../utils/notifications");
const {
  createSwapTimelineEvent,
  getParticipantActor,
} = require("../utils/swapTimeline");
const mongoose = require("mongoose");

const DEFAULT_PENDING_EXPIRY_MINUTES = 30;
const PAYMOB_LOG_PREFIX = "[paymob]";
const PAYMOB_SERVICE_FEE_PAYABLE_STATUSES = ["approved", "payment_pending"];
const ACTIVE_SERVICE_FEE_CHECKOUT_STATUSES = ["pending"];
const RECOVERABLE_SERVICE_FEE_RECONCILE_STATUSES = ["pending", "expired", "failed"];
const INACTIVE_SERVICE_FEE_CHECKOUT_STATUSES = ["failed", "expired"];
const PAYMOB_RETURN_PENDING_REASON =
  "Webhook not received yet or return confirmation could not be verified.";

const getString = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeId = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const toBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  }

  return false;
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getNestedValue = (source, path) => {
  if (source && typeof source === "object" && Object.prototype.hasOwnProperty.call(source, path)) {
    return source[path];
  }

  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object") {
      return current[key];
    }

    return undefined;
  }, source);
};

const getFirstNestedValue = (source, paths) => {
  for (const path of paths) {
    const value = getNestedValue(source, path);

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
};

const getPaymentObject = (payload) => {
  const eventObject = getPaymobEventObject(payload);

  if (eventObject?.transaction && typeof eventObject.transaction === "object") {
    return eventObject.transaction;
  }

  if (eventObject?.payment && typeof eventObject.payment === "object") {
    return eventObject.payment;
  }

  if (eventObject?.data?.transaction && typeof eventObject.data.transaction === "object") {
    return eventObject.data.transaction;
  }

  if (eventObject?.data?.payment && typeof eventObject.data.payment === "object") {
    return eventObject.data.payment;
  }

  const transactionList =
    (Array.isArray(eventObject?.transactions) && eventObject.transactions) ||
    (Array.isArray(eventObject?.data?.transactions) && eventObject.data.transactions) ||
    (Array.isArray(eventObject?.results) && eventObject.results) ||
    (Array.isArray(eventObject?.data?.results) && eventObject.data.results) ||
    [];

  const latestTransaction = transactionList.find((item) => item && typeof item === "object");
  if (latestTransaction) {
    return latestTransaction;
  }

  return eventObject || {};
};

const getPaymobOrderId = (eventObject) => {
  const order = getFirstNestedValue(eventObject, ["order", "order.id", "order_id", "paymob_order_id"]);

  if (order && typeof order === "object") {
    return normalizeId(order.id ?? order._id ?? order.order_id);
  }

  return normalizeId(order);
};

const getPaymobTransactionId = (eventObject) =>
  normalizeId(
    getFirstNestedValue(eventObject, [
      "id",
      "transaction_id",
      "paymob_transaction_id",
      "transaction.id",
    ])
  );

const getPaymobMerchantOrderId = (eventObject) => {
  const order = getFirstNestedValue(eventObject, ["order"]);

  if (order && typeof order === "object") {
    return normalizeId(order.merchant_order_id ?? order.merchantOrderId);
  }

  return normalizeId(
    getFirstNestedValue(eventObject, [
      "merchant_order_id",
      "merchantOrderId",
      "merchant_order.id",
    ])
  );
};

const getPaymobAmountCents = (eventObject) =>
  toNumber(getFirstNestedValue(eventObject, ["amount_cents", "amountCents"]));

const getPaymobIntegrationId = (eventObject) =>
  toNumber(getFirstNestedValue(eventObject, ["integration_id", "integrationId"]));

const getPaymobTxnResponseCode = (eventObject) =>
  getString(
    getFirstNestedValue(eventObject, [
      "txn_response_code",
      "txnResponseCode",
      "response_code",
      "responseCode",
      "data.message",
      "transaction.data.message",
      "payment.data.message",
    ])
  ).toUpperCase();

const PAYMOB_APPROVED_TXN_RESPONSE_CODES = new Set(["APPROVED", "00"]);

const buildPaymobMetadataSet = (metadata, set = {}) => {
  if (metadata.paymobTransactionId) {
    set["metadata.paymobTransactionId"] = metadata.paymobTransactionId;
    set["metadata.paymob_transaction_id"] = metadata.paymobTransactionId;
  }

  if (metadata.paymobOrderId) {
    set["metadata.paymobOrderId"] = metadata.paymobOrderId;
    set["metadata.paymob_order_id"] = metadata.paymobOrderId;
  }

  if (metadata.merchantOrderId) {
    set["metadata.merchantOrderId"] = metadata.merchantOrderId;
    set["metadata.merchant_order_id"] = metadata.merchantOrderId;
  }

  if (metadata.paymobAmountCents > 0) {
    set["metadata.paymobAmountCents"] = metadata.paymobAmountCents;
  }

  if (metadata.paymobCurrency) {
    set["metadata.paymobCurrency"] = metadata.paymobCurrency;
  }

  if (metadata.paymobIntegrationId > 0) {
    set["metadata.paymobIntegrationId"] = metadata.paymobIntegrationId;
  }

  if (metadata.paymobTxnResponseCode) {
    set["metadata.paymobTxnResponseCode"] = metadata.paymobTxnResponseCode;
    set["metadata.paymob_txn_response_code"] = metadata.paymobTxnResponseCode;
  }

  set["metadata.paymobSuccess"] = metadata.paymobSuccess;
  set["metadata.paymobPending"] = metadata.paymobPending;
  set["metadata.paymobErrorOccurred"] = metadata.paymobErrorOccurred;
  set["metadata.paymobWebhookReceivedAt"] = metadata.paymobWebhookReceivedAt;

  return set;
};

const safeLogDetails = (details = {}) =>
  Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined && value !== "")
  );

const logPaymob = (level, message, details = {}) => {
  const safeDetails = safeLogDetails(details);
  const suffix = Object.keys(safeDetails).length > 0 ? ` ${JSON.stringify(safeDetails)}` : "";
  const log = typeof logger[level] === "function" ? logger[level].bind(logger) : logger.info.bind(logger);

  log(`${PAYMOB_LOG_PREFIX} ${message}${suffix}`);
};

const isMongoObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || ""));

const getPaymobTransactionMatchKey = (transaction, { paymobOrderId, paymobTransactionId, merchantOrderId } = {}) => {
  const metadata = transaction?.metadata || {};

  if (
    paymobTransactionId &&
    [metadata.paymobTransactionId, metadata.paymob_transaction_id].some(
      (value) => normalizeId(value) === normalizeId(paymobTransactionId)
    )
  ) {
    return "paymob_transaction_id";
  }

  if (
    paymobOrderId &&
    [metadata.paymobOrderId, metadata.paymob_order_id].some(
      (value) => normalizeId(value) === normalizeId(paymobOrderId)
    )
  ) {
    return "paymob_order_id";
  }

  if (
    merchantOrderId &&
    [metadata.merchantOrderId, metadata.merchant_order_id].some(
      (value) => normalizeId(value) === normalizeId(merchantOrderId)
    )
  ) {
    return "merchant_order_id";
  }

  if (merchantOrderId) {
    const transactionIdFromMerchantOrder = String(merchantOrderId).replace(/^(coinpkg|svcfee)_/, "");

    if (String(transaction?._id) === transactionIdFromMerchantOrder) {
      return "merchant_order_transaction_id";
    }
  }

  return "unknown";
};

const findPaymobTransaction = async ({ paymobOrderId, paymobTransactionId, merchantOrderId }) => {
  const clauses = [];

  if (paymobOrderId) {
    clauses.push({ "metadata.paymobOrderId": String(paymobOrderId) });
    clauses.push({ "metadata.paymob_order_id": String(paymobOrderId) });
  }

  if (paymobTransactionId) {
    clauses.push({ "metadata.paymobTransactionId": String(paymobTransactionId) });
    clauses.push({ "metadata.paymob_transaction_id": String(paymobTransactionId) });
  }

  if (merchantOrderId) {
    clauses.push({ "metadata.merchantOrderId": String(merchantOrderId) });
    clauses.push({ "metadata.merchant_order_id": String(merchantOrderId) });

    const transactionIdFromMerchantOrder = String(merchantOrderId).replace(/^(coinpkg|svcfee)_/, "");

    if (isMongoObjectId(transactionIdFromMerchantOrder)) {
      clauses.push({ _id: transactionIdFromMerchantOrder });
    }
  }

  if (clauses.length === 0) {
    return null;
  }

  return Transaction.findOne({
    "metadata.provider": "paymob",
    $or: clauses,
  });
};

const findPaymobTransactionWithMatch = async (identifiers) => {
  const transaction = await findPaymobTransaction(identifiers);

  return {
    transaction,
    matchedBy: transaction ? getPaymobTransactionMatchKey(transaction, identifiers) : "",
  };
};

const getWebhookMetadata = (eventObject) => ({
  paymobTransactionId: getPaymobTransactionId(eventObject),
  paymobOrderId: getPaymobOrderId(eventObject),
  merchantOrderId: getPaymobMerchantOrderId(eventObject),
  paymobAmountCents: getPaymobAmountCents(eventObject),
  paymobCurrency: String(eventObject.currency || "").trim().toUpperCase(),
  paymobIntegrationId: getPaymobIntegrationId(eventObject),
  paymobTxnResponseCode: getPaymobTxnResponseCode(eventObject),
  paymobSuccess: toBoolean(eventObject.success),
  paymobPending: toBoolean(eventObject.pending),
  paymobErrorOccurred: toBoolean(eventObject.error_occured ?? eventObject.error_occurred),
  paymobWebhookReceivedAt: new Date(),
});

const getExpectedPaymobAmountCents = (transaction, coinPackage) => {
  const storedAmountCents = toNumber(transaction.metadata?.paymobAmountCents);

  if (storedAmountCents > 0) {
    return Math.round(storedAmountCents);
  }

  const storedPriceEGP = toNumber(transaction.metadata?.priceEGP);

  if (storedPriceEGP > 0) {
    return Math.round(storedPriceEGP * 100);
  }

  return Math.round(toNumber(coinPackage.priceEGP) * 100);
};

const isPaymobPaymentVoidedOrRefunded = (eventObject) =>
  toBoolean(eventObject.is_voided) || toBoolean(eventObject.is_refunded);

const hasApprovedTxnResponseCode = (metadata) =>
  !metadata.paymobTxnResponseCode ||
  PAYMOB_APPROVED_TXN_RESPONSE_CODES.has(metadata.paymobTxnResponseCode);

const hasDeclinedTxnResponseCode = (metadata) =>
  Boolean(metadata.paymobTxnResponseCode) &&
  !PAYMOB_APPROVED_TXN_RESPONSE_CODES.has(metadata.paymobTxnResponseCode);

const getPaymobApprovalResult = (eventObject, metadata) => {
  if (isPaymobPaymentVoidedOrRefunded(eventObject)) {
    return { approved: false, finalFailure: true, reason: "payment refunded or voided" };
  }

  if (metadata.paymobPending === true) {
    return { approved: false, finalFailure: false, reason: "payment still pending" };
  }

  if (hasDeclinedTxnResponseCode(metadata)) {
    return { approved: false, finalFailure: true, reason: "payment not approved" };
  }

  if (metadata.paymobErrorOccurred === true) {
    return { approved: false, finalFailure: true, reason: "payment error occurred" };
  }

  if (metadata.paymobSuccess !== true) {
    return { approved: false, finalFailure: true, reason: "payment not completed" };
  }

  if (!hasApprovedTxnResponseCode(metadata)) {
    return { approved: false, finalFailure: true, reason: "payment not approved" };
  }

  return { approved: true, finalFailure: false };
};

const isKnownPaymentPurpose = (purpose) =>
  purpose === "coin_package" || purpose === "service_fee";

const getPaymentPurpose = (transaction) => {
  const storedPurpose = getString(transaction?.metadata?.purpose);

  if (isKnownPaymentPurpose(storedPurpose)) {
    return storedPurpose;
  }

  if (transaction?.type === "service_fee") {
    return "service_fee";
  }

  return "coin_package";
};

const getPaymobFailureDescription = (transaction, reason) =>
  getPaymentPurpose(transaction) === "service_fee"
    ? `Swap service fee payment failed: ${reason}`
    : `Coin package payment failed: ${reason}`;

const getPaymobSwapId = (transaction, swap) => {
  const source = swap || transaction?.swap;

  if (!source) return undefined;

  return String(source._id || source.id || source);
};

const getPaymobReturnReasonMessage = (reason) => {
  if (!reason) return undefined;

  const messages = {
    "amount or currency mismatch": "Paymob amount or currency mismatch.",
    "integration id mismatch": "Paymob integration id mismatch.",
    "invalid hmac": "Return confirmation signature could not be verified.",
    "matching transaction not found": "No matching Paymob transaction was found.",
    "payment not approved": "Paymob payment was not approved.",
    "payment not completed": "Paymob transaction was not successful.",
    "payment error occurred": "Paymob reported a payment error.",
    "payment approval code missing": "Paymob approval code was not available yet.",
    "payment refunded or voided": "Paymob payment was refunded or voided.",
    "payment still pending": "Paymob payment is still pending.",
    "server verification failed": PAYMOB_RETURN_PENDING_REASON,
    "transaction already completed": "Paymob transaction was already completed.",
  };

  return messages[reason] || reason;
};

const buildPaymobReturnResponse = async ({
  message,
  reason,
  status,
  success,
  swap,
  transaction,
  wallet,
}) => {
  const purpose = transaction ? getPaymentPurpose(transaction) : undefined;
  const response = {
    success,
    message,
    status: status || transaction?.status || "pending",
  };

  if (purpose) {
    response.purpose = purpose;
  }

  if (reason) {
    response.reason = getPaymobReturnReasonMessage(reason);
  }

  if (transaction) {
    response.transaction = serializeTransaction(transaction);
  }

  if (purpose === "service_fee") {
    const serializedSwap = serializeServiceFeeSwap(swap);
    const swapId = serializedSwap?.id || getPaymobSwapId(transaction, swap);
    const checkout = getPaymobCheckoutUrls(transaction);

    if (swapId) {
      response.swapId = swapId;
    }

    if (serializedSwap) {
      response.swap = serializedSwap;
    }

    if (transaction?.status === "pending") {
      response.checkoutUrl = checkout.checkoutUrl;
      response.paymentUrl = checkout.paymentUrl;
      response.iframeUrl = checkout.iframeUrl;
      response.canContinue = checkout.canContinue;
    }
  }

  if (purpose === "coin_package" && wallet) {
    response.wallet = wallet;
  }

  return response;
};

const sendPaymobReturnResponse = async (res, statusCode, options) =>
  res.status(statusCode).json(await buildPaymobReturnResponse(options));

const markTransactionFailed = async (transaction, metadata, reason, options = {}) => {
  if (!transaction || !["pending", "expired"].includes(transaction.status)) {
    return transaction;
  }

  const failureSet = {
    status: "failed",
    description: getPaymobFailureDescription(transaction, reason),
    "metadata.paymobFailureReason": reason,
  };

  if (options.finalVerified) {
    failureSet["metadata.paymobFinalFailureVerifiedAt"] = new Date();
    failureSet["metadata.paymobFinalFailureVerifiedBy"] = options.source || "paymob-status";
  }

  return Transaction.findOneAndUpdate(
    {
      _id: transaction._id,
      status: { $in: ["pending", "expired"] },
      "metadata.provider": "paymob",
    },
    {
      $set: buildPaymobMetadataSet(metadata, failureSet),
    },
    { returnDocument: "after" }
  );
};

const expireStalePendingPaymobPurchases = async ({ olderThanMinutes = DEFAULT_PENDING_EXPIRY_MINUTES } = {}) => {
  const minutes = Number.isFinite(Number(olderThanMinutes))
    ? Math.max(1, Math.round(Number(olderThanMinutes)))
    : DEFAULT_PENDING_EXPIRY_MINUTES;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);

  return Transaction.updateMany(
    {
      type: "package_purchase_pending",
      status: "pending",
      "metadata.provider": "paymob",
      createdAt: { $lte: cutoff },
    },
    {
      $set: {
        status: "expired",
        description: `Coin package checkout expired after ${minutes} minutes`,
        "metadata.paymobExpiredAt": new Date(),
        "metadata.paymobExpiryMinutes": minutes,
      },
    }
  );
};

const completePaymobPackagePurchase = async ({ transaction, coinPackage, metadata, source }) => {
  const completedTransaction = await Transaction.findOneAndUpdate(
    {
      _id: transaction._id,
      status: { $in: ["pending", "expired"] },
      type: "package_purchase_pending",
      "metadata.provider": "paymob",
      "metadata.coinCreditedAt": { $exists: false },
    },
    {
      $set: buildPaymobMetadataSet(metadata, {
        status: "completed",
        type: "package_purchase_completed",
        description: `Purchased ${coinPackage.coins} coins via Paymob`,
        "metadata.paymobCompletedBy": source,
      }),
    },
    { returnDocument: "after" }
  );

  if (!completedTransaction) {
    const currentTransaction = await Transaction.findById(transaction._id);

    logPaymob("info", "duplicate webhook ignored", {
      source,
      transactionId: transaction._id,
      status: currentTransaction?.status || transaction.status,
      type: currentTransaction?.type || transaction.type,
    });

    return {
      statusCode: 200,
      message:
        currentTransaction?.status === "completed"
          ? "Paymob webhook already processed"
          : "Paymob transaction is not pending",
      transaction: currentTransaction || transaction,
      reason:
        currentTransaction?.status === "completed"
          ? "transaction already completed"
          : "transaction already processed",
    };
  }

  const updatedUser = await User.findOneAndUpdate(
    {
      _id: completedTransaction.user,
      is_deleted: { $ne: true },
    },
    {
      $inc: {
        coins: coinPackage.coins,
        total_coins_earned: coinPackage.coins,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedUser) {
    const failedTransaction = await Transaction.findByIdAndUpdate(
      completedTransaction._id,
      {
        $set: {
          status: "failed",
          description: "Coin package payment failed: user not found",
          "metadata.paymobFailureReason": "user not found",
        },
      },
      { returnDocument: "after" }
    );

    logPaymob("warn", "webhook rejected", {
      source,
      reason: "user not found",
      transactionId: completedTransaction._id,
      paymobOrderId: metadata.paymobOrderId,
      paymobTransactionId: metadata.paymobTransactionId,
    });

    return {
      statusCode: 400,
      message: "Transaction user is no longer available",
      transaction: failedTransaction || completedTransaction,
    };
  }

  await Transaction.updateOne(
    { _id: completedTransaction._id },
    { $set: { "metadata.coinCreditedAt": new Date() } }
  );
  await createWalletNotification(completedTransaction);

  const finalTransaction = await Transaction.findById(completedTransaction._id);

  logPaymob("info", "credit success", {
    source,
    transactionId: completedTransaction._id,
    userId: completedTransaction.user,
    coins: coinPackage.coins,
    paymobOrderId: metadata.paymobOrderId,
    paymobTransactionId: metadata.paymobTransactionId,
  });

  return {
    statusCode: 200,
    message: "Paymob payment completed",
    transaction: finalTransaction || completedTransaction,
  };
};

const getServiceFeeSide = (transaction) => {
  const side = transaction?.metadata?.serviceFeeSide;
  return side === "requester" || side === "receiver" ? side : "";
};

const getPaymobCheckoutUrls = (transaction) => {
  const paymentUrl =
    transaction?.metadata?.paymobPaymentUrl ||
    transaction?.metadata?.paymobIframeUrl ||
    "";
  const iframeUrl =
    transaction?.metadata?.paymobIframeUrl ||
    transaction?.metadata?.paymobPaymentUrl ||
    "";

  return {
    checkoutUrl: paymentUrl,
    paymentUrl,
    iframeUrl,
    canContinue: Boolean(paymentUrl),
  };
};

const getServiceFeePaidField = (side) =>
  side === "requester" ? "requester_paid" : "receiver_paid";

const getServiceFeeAmountCents = (transaction) => {
  const storedAmountCents = toNumber(transaction.metadata?.paymobAmountCents);

  if (storedAmountCents > 0) {
    return Math.round(storedAmountCents);
  }

  const storedFeeEGP = toNumber(transaction.metadata?.serviceFeeEGP);

  if (storedFeeEGP > 0) {
    return Math.round(storedFeeEGP * 100);
  }

  const transactionAmount = toNumber(transaction.amount);

  if (transactionAmount > 0) {
    return Math.round(transactionAmount * 100);
  }

  return Math.round(getSwapServiceFeeEGP() * 100);
};

const getServiceFeeParticipant = (swap, side) =>
  side === "requester" ? swap.requester : swap.receiver;

const getServiceFeeOtherParticipant = (swap, side) =>
  side === "requester" ? swap.receiver : swap.requester;

const serializeServiceFeeSwap = (swap) => {
  if (!swap) return null;
  const source = typeof swap.toObject === "function" ? swap.toObject() : swap;

  return {
    _id: source._id,
    id: String(source._id || source.id),
    status: source.status,
    requester: source.requester,
    receiver: source.receiver,
    requester_paid: Boolean(source.requester_paid),
    receiver_paid: Boolean(source.receiver_paid),
    service_fee_requester: Number(source.service_fee_requester || getSwapServiceFeeEGP()),
    service_fee_receiver: Number(source.service_fee_receiver || getSwapServiceFeeEGP()),
  };
};

const applyCompletedServiceFeeToSwap = async ({ transaction, metadata, source }) => {
  const side = getServiceFeeSide(transaction);
  const paidField = getServiceFeePaidField(side);
  const swap = await SwapRequest.findById(transaction.swap);

  if (!swap) {
    logPaymob("warn", "webhook rejected", {
      source,
      reason: "swap not found",
      transactionId: transaction._id,
      swapId: transaction.swap,
    });

    return {
      statusCode: 400,
      message: "Service fee swap was not found",
      transaction,
      swap: null,
    };
  }

  if (!swap[paidField] && !PAYMOB_SERVICE_FEE_PAYABLE_STATUSES.includes(swap.status)) {
    const failedTransaction = await Transaction.findByIdAndUpdate(
      transaction._id,
      {
        $set: {
          status: "failed",
          description: "Swap service fee payment failed: swap is not payable",
          "metadata.paymobFailureReason": "swap is not payable",
        },
      },
      { returnDocument: "after" }
    );

    logPaymob("warn", "webhook rejected", {
      source,
      reason: "swap is not payable",
      transactionId: transaction._id,
      swapId: swap._id,
      swapStatus: swap.status,
    });

    return {
      statusCode: 400,
      message: "Swap is not payable for service fees",
      transaction: failedTransaction || transaction,
      swap,
    };
  }

  const wasAlreadyPaid = Boolean(swap[paidField]);
  const wasFullyPaid = Boolean(swap.requester_paid && swap.receiver_paid);

  if (!wasAlreadyPaid) {
    swap[paidField] = true;
    swap.status = swap.requester_paid && swap.receiver_paid ? "exchange_setup" : "payment_pending";
    await swap.save();

    await createSwapTimelineEvent({
      swap,
      event: "service_fee_paid",
      description: `${side === "requester" ? "Requester" : "Receiver"} paid their service fee.`,
      actor: side,
      actor_id: getServiceFeeParticipant(swap, side),
    });

    await createNotification({
      user: getServiceFeeOtherParticipant(swap, side),
      type: "payment",
      title: "Service fee paid",
      body: "The other participant paid their service fee.",
      related_swap: swap._id,
    });

    if (!wasFullyPaid && swap.requester_paid && swap.receiver_paid) {
      await createSwapTimelineEvent({
        swap,
        event: "service_fees_completed",
        description: "Both service fees were paid. Exchange setup is ready.",
        actor: "system",
      });

      await createNotifications([
        {
          user: swap.requester,
          type: "payment",
          title: "Service fees completed",
          body: "Both participants paid their service fees. Exchange setup is ready.",
          related_swap: swap._id,
        },
        {
          user: swap.receiver,
          type: "payment",
          title: "Service fees completed",
          body: "Both participants paid their service fees. Exchange setup is ready.",
          related_swap: swap._id,
        },
      ]);
    }
  }

  await Transaction.updateOne(
    { _id: transaction._id },
    {
      $set: {
        "metadata.serviceFeeAppliedAt": new Date(),
        "metadata.swapStatusAfterServiceFee": swap.status,
      },
    }
  );

  const finalTransaction = await Transaction.findById(transaction._id);

  logPaymob("info", "service fee success", {
    source,
    transactionId: transaction._id,
    userId: transaction.user,
    swapId: swap._id,
    side,
    alreadyPaid: wasAlreadyPaid,
    paymobOrderId: metadata.paymobOrderId,
    paymobTransactionId: metadata.paymobTransactionId,
  });

  return {
    statusCode: 200,
    message: wasAlreadyPaid ? "Paymob webhook already processed" : "Paymob payment completed",
    transaction: finalTransaction || transaction,
    swap,
    reason: wasAlreadyPaid ? "transaction already completed" : undefined,
  };
};

const completePaymobServiceFeePayment = async ({ transaction, metadata, source }) => {
  const completableStatuses = ["pending", "expired"];
  const extraFilter = {};

  if (transaction.status === "failed" && !transaction.metadata?.paymobFinalFailureVerifiedAt) {
    completableStatuses.push("failed");
    extraFilter["metadata.paymobFinalFailureVerifiedAt"] = { $exists: false };
  }

  const completedTransaction = await Transaction.findOneAndUpdate(
    {
      _id: transaction._id,
      status: { $in: completableStatuses },
      type: "service_fee",
      "metadata.provider": "paymob",
      ...extraFilter,
    },
    {
      $set: buildPaymobMetadataSet(metadata, {
        status: "completed",
        description: "Paid swap service fee via Paymob",
        "metadata.paymobCompletedBy": source,
      }),
      $unset: {
        "metadata.paymobPendingReason": "",
        "metadata.paymobFailureReason": "",
        "metadata.paymobFinalFailureVerifiedAt": "",
        "metadata.paymobFinalFailureVerifiedBy": "",
      },
    },
    { returnDocument: "after" }
  );

  if (!completedTransaction) {
    const currentTransaction = await Transaction.findById(transaction._id);

    logPaymob("info", "duplicate webhook ignored", {
      source,
      transactionId: transaction._id,
      status: currentTransaction?.status || transaction.status,
      type: currentTransaction?.type || transaction.type,
    });

    return {
      statusCode: 200,
      message:
        currentTransaction?.status === "completed"
          ? "Paymob webhook already processed"
          : "Paymob transaction is not pending",
      transaction: currentTransaction || transaction,
      reason:
        currentTransaction?.status === "completed"
          ? "transaction already completed"
          : "transaction already processed",
    };
  }

  return applyCompletedServiceFeeToSwap({
    transaction: completedTransaction,
    metadata,
    source,
  });
};

const processPaymobServiceFeePayment = async ({
  transaction,
  eventObject,
  metadata,
  source,
  incompletePaymentStatusCode = 200,
  keepPendingOnIncomplete = false,
}) => {
  if (transaction.status === "completed") {
    if (!transaction.metadata?.serviceFeeAppliedAt) {
      return applyCompletedServiceFeeToSwap({
        transaction,
        metadata,
        source,
      });
    }

    logPaymob("info", "duplicate webhook ignored", {
      source,
      reason: "transaction already completed",
      transactionId: transaction._id,
      paymobOrderId: metadata.paymobOrderId,
      paymobTransactionId: metadata.paymobTransactionId,
    });

    return {
      statusCode: 200,
      message: "Paymob webhook already processed",
      transaction,
      swap: transaction.swap ? await SwapRequest.findById(transaction.swap) : null,
      reason: "transaction already completed",
    };
  }

  if (transaction.status === "failed") {
    if (!transaction.metadata?.paymobFinalFailureVerifiedAt && keepPendingOnIncomplete) {
      logPaymob("info", "service fee failed transaction is recoverable", {
        source,
        transactionId: transaction._id,
        reason: transaction.metadata?.paymobFailureReason,
      });
    } else {
    logPaymob("info", "duplicate webhook ignored", {
      source,
      reason: "transaction already failed",
      transactionId: transaction._id,
    });

    return {
      statusCode: 200,
      message: "Paymob transaction is not pending",
      transaction,
      reason: "transaction already failed",
    };
    }
  }

  const side = getServiceFeeSide(transaction);

  if (!side || !transaction.swap) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "invalid service fee transaction");

    logPaymob("warn", "webhook rejected", {
      source,
      reason: "invalid service fee transaction",
      transactionId: transaction._id,
    });

    return {
      statusCode: 400,
      message: "Service fee transaction is invalid",
      transaction: failedTransaction || transaction,
      reason: "invalid service fee transaction",
    };
  }

  const swap = await SwapRequest.findById(transaction.swap);
  const paidField = getServiceFeePaidField(side);

  if (!swap) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "swap not found");

    return {
      statusCode: 400,
      message: "Service fee swap was not found",
      transaction: failedTransaction || transaction,
      reason: "swap not found",
    };
  }

  if (swap[paidField]) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "service fee already paid");

    return {
      statusCode: 400,
      message: "Service fee was already paid",
      transaction: failedTransaction || transaction,
      swap,
      reason: "service fee already paid",
    };
  }

  if (!PAYMOB_SERVICE_FEE_PAYABLE_STATUSES.includes(swap.status)) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "swap is not payable");

    return {
      statusCode: 400,
      message: "Swap is not payable for service fees",
      transaction: failedTransaction || transaction,
      swap,
      reason: "swap is not payable",
    };
  }

  const expectedAmountCents = getServiceFeeAmountCents(transaction);
  const expectedCurrency = String(transaction.metadata?.paymobCurrency || getPaymobCurrency()).toUpperCase();

  if (
    Math.round(metadata.paymobAmountCents) !== expectedAmountCents ||
    metadata.paymobCurrency !== expectedCurrency
  ) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "amount or currency mismatch");

    logPaymob("warn", "webhook rejected", {
      source,
      reason: "amount or currency mismatch",
      transactionId: transaction._id,
      paymobAmountCents: metadata.paymobAmountCents,
      expectedAmountCents,
      paymobCurrency: metadata.paymobCurrency,
      expectedCurrency,
    });

    return {
      statusCode: 400,
      message: "Paymob amount or currency mismatch",
      transaction: failedTransaction || transaction,
      swap,
      reason: "amount or currency mismatch",
    };
  }

  logPaymob("info", "amount matched", {
    source,
    transactionId: transaction._id,
    amountCents: metadata.paymobAmountCents,
    currency: metadata.paymobCurrency,
  });

  const approval = getPaymobApprovalResult(eventObject, metadata);

  if (!approval.approved) {
    const reason = approval.reason || "payment not completed";

    if (keepPendingOnIncomplete) {
      if (approval.finalFailure) {
        const failedTransaction = await markServiceFeeFinalFailure({
          transaction,
          metadata,
          reason,
          source,
        });

        logPaymob("warn", "service fee reconcile failed", {
          source,
          reason,
          transactionId: transaction._id,
          success: metadata.paymobSuccess,
          pending: metadata.paymobPending,
          errorOccurred: metadata.paymobErrorOccurred,
          txnResponseCode: metadata.paymobTxnResponseCode,
          isRefunded: toBoolean(eventObject.is_refunded),
          isVoided: toBoolean(eventObject.is_voided),
        });

        return {
          statusCode: 400,
          message: "Paymob payment was not approved",
          transaction: failedTransaction || transaction,
          swap,
          reason,
        };
      }

      const pendingTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        {
          $set: buildPaymobMetadataSet(metadata, {
            description: `Pending ${side} service fee via Paymob`,
            "metadata.paymobPendingReason": reason,
          }),
          $unset: {
            "metadata.paymobFinalFailureVerifiedAt": "",
            "metadata.paymobFinalFailureVerifiedBy": "",
          },
        },
        { returnDocument: "after" }
      );

      logPaymob("warn", "service fee reconcile pending", {
        source,
        reason,
        transactionId: transaction._id,
        success: metadata.paymobSuccess,
        pending: metadata.paymobPending,
        errorOccurred: metadata.paymobErrorOccurred,
        txnResponseCode: metadata.paymobTxnResponseCode,
        isRefunded: toBoolean(eventObject.is_refunded),
        isVoided: toBoolean(eventObject.is_voided),
      });

      return {
        statusCode: incompletePaymentStatusCode,
        message: "Service fee payment confirmation is pending",
        transaction: pendingTransaction || transaction,
        swap,
        reason,
      };
    }

    const failedTransaction = await markTransactionFailed(transaction, metadata, "payment not completed");

    logPaymob("warn", "webhook rejected", {
      source,
      reason,
      transactionId: transaction._id,
      success: metadata.paymobSuccess,
      pending: metadata.paymobPending,
      errorOccurred: metadata.paymobErrorOccurred,
      txnResponseCode: metadata.paymobTxnResponseCode,
      isRefunded: toBoolean(eventObject.is_refunded),
      isVoided: toBoolean(eventObject.is_voided),
    });

    return {
      statusCode: incompletePaymentStatusCode,
      message: failedTransaction ? "Paymob payment marked failed" : "Paymob payment already processed",
      transaction: failedTransaction || transaction,
      swap,
      reason: "payment not completed",
    };
  }

  return completePaymobServiceFeePayment({
    transaction,
    metadata,
    source,
  });
};

const processPaymobPackagePayment = async ({
  transaction,
  eventObject,
  metadata,
  source,
  incompletePaymentStatusCode = 200,
}) => {
  if (transaction.status === "completed" || transaction.type === "package_purchase_completed") {
    logPaymob("info", "duplicate webhook ignored", {
      source,
      transactionId: transaction._id,
      paymobOrderId: metadata.paymobOrderId,
      paymobTransactionId: metadata.paymobTransactionId,
    });

    return {
      statusCode: 200,
      message: "Paymob webhook already processed",
      transaction,
      reason: "transaction already completed",
    };
  }

  if (transaction.status === "failed") {
    logPaymob("info", "duplicate webhook ignored", {
      source,
      reason: "transaction already failed",
      transactionId: transaction._id,
    });

    return {
      statusCode: 200,
      message: "Paymob transaction is not pending",
      transaction,
      reason: "transaction already failed",
    };
  }

  const coinPackage = getCoinPackage(transaction.metadata?.packageId);

  if (!coinPackage) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "invalid package");

    logPaymob("warn", "webhook rejected", {
      source,
      reason: "invalid package",
      transactionId: transaction._id,
    });

    return {
      statusCode: 400,
      message: "Transaction package is invalid",
      transaction: failedTransaction || transaction,
      reason: "invalid package",
    };
  }

  const expectedAmountCents = getExpectedPaymobAmountCents(transaction, coinPackage);
  const expectedCurrency = String(transaction.metadata?.paymobCurrency || getPaymobCurrency()).toUpperCase();

  if (
    Math.round(metadata.paymobAmountCents) !== expectedAmountCents ||
    metadata.paymobCurrency !== expectedCurrency
  ) {
    const failedTransaction = await markTransactionFailed(transaction, metadata, "amount or currency mismatch");

    logPaymob("warn", "webhook rejected", {
      source,
      reason: "amount or currency mismatch",
      transactionId: transaction._id,
      paymobAmountCents: metadata.paymobAmountCents,
      expectedAmountCents,
      paymobCurrency: metadata.paymobCurrency,
      expectedCurrency,
    });

    return {
      statusCode: 400,
      message: "Paymob amount or currency mismatch",
      transaction: failedTransaction || transaction,
      reason: "amount or currency mismatch",
    };
  }

  logPaymob("info", "amount matched", {
    source,
    transactionId: transaction._id,
    amountCents: metadata.paymobAmountCents,
    currency: metadata.paymobCurrency,
  });

  const approval = getPaymobApprovalResult(eventObject, metadata);

  if (!approval.approved) {
    const reason = approval.reason || "payment not completed";
    const failedTransaction = await markTransactionFailed(transaction, metadata, reason);

    logPaymob("warn", "webhook rejected", {
      source,
      reason,
      transactionId: transaction._id,
      success: metadata.paymobSuccess,
      pending: metadata.paymobPending,
      errorOccurred: metadata.paymobErrorOccurred,
      txnResponseCode: metadata.paymobTxnResponseCode,
    });

    return {
      statusCode: incompletePaymentStatusCode,
      message: failedTransaction
        ? reason === "payment not approved"
          ? "Paymob payment was not approved"
          : "Paymob payment marked failed"
        : "Paymob payment already processed",
      transaction: failedTransaction || transaction,
      reason,
    };
  }

  return completePaymobPackagePurchase({
    transaction,
    coinPackage,
    metadata,
    source,
  });
};

const processPaymobPayment = async (options) => {
  if (getPaymentPurpose(options.transaction) === "service_fee") {
    return processPaymobServiceFeePayment(options);
  }

  return processPaymobPackagePayment(options);
};

const mergeStoredPaymobMetadata = (metadata, transaction) => ({
  ...metadata,
  paymobTransactionId: metadata.paymobTransactionId || normalizeId(transaction.metadata?.paymobTransactionId),
  paymobOrderId: metadata.paymobOrderId || normalizeId(transaction.metadata?.paymobOrderId),
  merchantOrderId: metadata.merchantOrderId || normalizeId(transaction.metadata?.merchantOrderId),
  paymobAmountCents: metadata.paymobAmountCents || toNumber(transaction.metadata?.paymobAmountCents),
  paymobCurrency:
    metadata.paymobCurrency || String(transaction.metadata?.paymobCurrency || getPaymobCurrency()).toUpperCase(),
  paymobIntegrationId: metadata.paymobIntegrationId || toNumber(transaction.metadata?.paymobIntegrationId),
  paymobTxnResponseCode:
    metadata.paymobTxnResponseCode || getString(transaction.metadata?.paymobTxnResponseCode).toUpperCase(),
});

const normalizeReturnQuery = (query) => {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return null;
  }

  return Object.entries(query).reduce((normalized, [key, value]) => {
    if (Array.isArray(value)) {
      normalized[key] = normalizeId(value[0]);
    } else {
      normalized[key] = normalizeId(value);
    }

    return normalized;
  }, {});
};

const getExpectedIntegrationId = (transaction) =>
  toNumber(transaction.metadata?.paymobIntegrationId || process.env.PAYMOB_INTEGRATION_ID);

const storePendingServiceFeeReconcileMetadata = async (transaction, metadata, reason) =>
  Transaction.findByIdAndUpdate(
    transaction._id,
    {
      $set: buildPaymobMetadataSet(metadata, {
        "metadata.paymobPendingReason": reason,
      }),
      $unset: {
        "metadata.paymobFinalFailureVerifiedAt": "",
        "metadata.paymobFinalFailureVerifiedBy": "",
      },
    },
    { returnDocument: "after" }
  );

const markServiceFeeFinalFailure = async ({ transaction, metadata, reason, source }) =>
  Transaction.findOneAndUpdate(
    {
      _id: transaction._id,
      type: "service_fee",
      "metadata.provider": "paymob",
      status: { $in: RECOVERABLE_SERVICE_FEE_RECONCILE_STATUSES },
    },
    {
      $set: buildPaymobMetadataSet(metadata, {
        status: "failed",
        description: getPaymobFailureDescription(transaction, reason),
        "metadata.paymobFailureReason": reason,
        "metadata.paymobFinalFailureVerifiedAt": new Date(),
        "metadata.paymobFinalFailureVerifiedBy": source,
      }),
    },
    { returnDocument: "after" }
  );

const reconcileServiceFeeTransaction = async ({ transaction, source, requestId, lookupMetadata = {} }) => {
  if (getPaymentPurpose(transaction) !== "service_fee") {
    return {
      statusCode: 400,
      message: "Only service fee Paymob transactions can be reconciled here",
      transaction,
      reason: "invalid service fee transaction",
      success: false,
      status: transaction?.status || "pending",
    };
  }

  const side = getServiceFeeSide(transaction);
  const swap = transaction.swap ? await SwapRequest.findById(transaction.swap) : null;

  if (!side || !swap) {
    return {
      statusCode: 400,
      message: "Service fee transaction is invalid",
      transaction,
      swap,
      reason: !side ? "invalid service fee transaction" : "swap not found",
      success: false,
      status: transaction.status || "pending",
    };
  }

  if (transaction.status === "completed" && transaction.metadata?.serviceFeeAppliedAt) {
    logPaymob("info", "service fee reconcile already completed", {
      requestId,
      source,
      transactionId: transaction._id,
      swapId: swap._id,
      side,
    });

    return {
      statusCode: 200,
      message: "Service fee already confirmed",
      transaction,
      swap,
      reason: "transaction already completed",
      success: true,
      status: "completed",
    };
  }

  if (transaction.status === "failed" && transaction.metadata?.paymobFinalFailureVerifiedAt) {
    const reason = transaction.metadata?.paymobFailureReason || "payment not completed";

    logPaymob("warn", "service fee reconcile failed", {
      requestId,
      source,
      reason,
      transactionId: transaction._id,
      swapId: swap._id,
      side,
      finalFailureVerifiedAt: transaction.metadata.paymobFinalFailureVerifiedAt,
    });

    return {
      statusCode: 400,
      message: "Paymob payment was not approved",
      transaction,
      swap,
      reason,
      success: false,
      status: "failed",
    };
  }

  let eventObject;
  let metadata;

  try {
    const paymobStatus = await fetchPaymobPaymentStatus({
      paymobTransactionId: lookupMetadata.paymobTransactionId || transaction.metadata?.paymobTransactionId,
      paymobOrderId: lookupMetadata.paymobOrderId || transaction.metadata?.paymobOrderId,
      merchantOrderId: lookupMetadata.merchantOrderId || transaction.metadata?.merchantOrderId,
    });

    eventObject = getPaymentObject(paymobStatus);
    metadata = mergeStoredPaymobMetadata(getWebhookMetadata(eventObject), transaction);
    logPaymob("info", "service fee reconcile Paymob status fetched", {
      requestId,
      source,
      transactionId: transaction._id,
      swapId: swap._id,
      side,
      paymobOrderId: metadata.paymobOrderId,
      paymobTransactionId: metadata.paymobTransactionId,
      merchantOrderId: metadata.merchantOrderId,
      success: metadata.paymobSuccess,
      pending: metadata.paymobPending,
      errorOccurred: metadata.paymobErrorOccurred,
      txnResponseCode: metadata.paymobTxnResponseCode,
      isRefunded: toBoolean(eventObject.is_refunded),
      isVoided: toBoolean(eventObject.is_voided),
    });
  } catch (error) {
    logPaymob("warn", "service fee reconcile pending", {
      requestId,
      source,
      reason: "server verification failed",
      transactionId: transaction._id,
      swapId: swap._id,
      side,
      paymobOrderId: transaction.metadata?.paymobOrderId,
      paymobTransactionId: transaction.metadata?.paymobTransactionId,
      merchantOrderId: transaction.metadata?.merchantOrderId,
      error: error.message,
    });

    return {
      statusCode: 202,
      message: "Service fee payment confirmation is pending",
      transaction,
      swap,
      reason: "server verification failed",
      success: false,
      status: transaction.status || "pending",
    };
  }

  const expectedIntegrationId = getExpectedIntegrationId(transaction);

  if (
    !metadata.paymobIntegrationId ||
    !expectedIntegrationId ||
    metadata.paymobIntegrationId !== expectedIntegrationId
  ) {
    const pendingTransaction = await storePendingServiceFeeReconcileMetadata(
      transaction,
      metadata,
      "integration id mismatch"
    );

    logPaymob("warn", "service fee reconcile pending", {
      requestId,
      source,
      reason: "integration id mismatch",
      transactionId: transaction._id,
      swapId: swap._id,
      side,
      paymobIntegrationId: metadata.paymobIntegrationId,
      expectedIntegrationId,
    });

    return {
      statusCode: 202,
      message: "Service fee payment confirmation is pending",
      transaction: pendingTransaction || transaction,
      swap,
      reason: "integration id mismatch",
      success: false,
      status: (pendingTransaction || transaction).status || "pending",
    };
  }

  const expectedAmountCents = getServiceFeeAmountCents(transaction);
  const expectedCurrency = String(transaction.metadata?.paymobCurrency || getPaymobCurrency()).toUpperCase();

  if (
    Math.round(metadata.paymobAmountCents) !== expectedAmountCents ||
    metadata.paymobCurrency !== expectedCurrency
  ) {
    const pendingTransaction = await storePendingServiceFeeReconcileMetadata(
      transaction,
      metadata,
      "amount or currency mismatch"
    );

    logPaymob("warn", "service fee reconcile pending", {
      requestId,
      source,
      reason: "amount or currency mismatch",
      transactionId: transaction._id,
      swapId: swap._id,
      side,
      paymobAmountCents: metadata.paymobAmountCents,
      expectedAmountCents,
      paymobCurrency: metadata.paymobCurrency,
      expectedCurrency,
    });

    return {
      statusCode: 202,
      message: "Service fee payment confirmation is pending",
      transaction: pendingTransaction || transaction,
      swap,
      reason: "amount or currency mismatch",
      success: false,
      status: (pendingTransaction || transaction).status || "pending",
    };
  }

  const result = await processPaymobPayment({
    transaction,
    eventObject,
    metadata,
    source,
    incompletePaymentStatusCode: 202,
    keepPendingOnIncomplete: true,
  });
  const resultTransaction = result.transaction || transaction;
  const success = resultTransaction.status === "completed";
  const finalStatus = resultTransaction.status || transaction.status || "pending";

  logPaymob(success ? "info" : "warn", "service fee reconcile decision", {
    requestId,
    source,
    transactionId: resultTransaction._id,
    swapId: swap._id,
    side,
    status: finalStatus,
    success,
    reason: success ? undefined : result.reason || resultTransaction.metadata?.paymobFailureReason,
    finalFailureVerified: Boolean(resultTransaction.metadata?.paymobFinalFailureVerifiedAt),
  });

  return {
    ...result,
    success,
    status: finalStatus,
  };
};

exports.listCoinPackages = asyncHandler(async (req, res) => {
  return res.json({
    packages: COIN_PACKAGES.map(serializeCoinPackage),
  });
});

const expireStalePendingServiceFeeCheckouts = async ({ userId, swapId, side }) => {
  const cutoff = new Date(Date.now() - DEFAULT_PENDING_EXPIRY_MINUTES * 60 * 1000);

  return Transaction.updateMany(
    {
      user: userId,
      swap: swapId,
      type: "service_fee",
      status: "pending",
      "metadata.provider": "paymob",
      "metadata.serviceFeeSide": side,
      createdAt: { $lte: cutoff },
    },
    {
      $set: {
        status: "expired",
        description: `Swap service fee checkout expired after ${DEFAULT_PENDING_EXPIRY_MINUTES} minutes`,
        "metadata.paymobExpiredAt": new Date(),
        "metadata.paymobExpiryMinutes": DEFAULT_PENDING_EXPIRY_MINUTES,
      },
    }
  );
};

exports.createServiceFeeCheckout = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const [user, swap] = await Promise.all([
    User.findOne({ _id: req.userId, is_deleted: { $ne: true } }),
    SwapRequest.findOne({
      _id: req.params.id,
      $or: [{ requester: req.userId }, { receiver: req.userId }],
    }),
  ]);

  if (!user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  if (!PAYMOB_SERVICE_FEE_PAYABLE_STATUSES.includes(swap.status)) {
    return res.status(400).json({
      message: "Service fee can only be paid after admin approval",
      swap: serializeServiceFeeSwap(swap),
    });
  }

  const side = String(swap.requester) === String(req.userId) ? "requester" : "receiver";
  const paidField = getServiceFeePaidField(side);
  const feeEGP = Number(
    side === "requester"
      ? swap.service_fee_requester || getSwapServiceFeeEGP()
      : swap.service_fee_receiver || getSwapServiceFeeEGP()
  );

  if (swap[paidField]) {
    return res.status(400).json({
      message: "Service fee was already paid",
      swap: serializeServiceFeeSwap(swap),
    });
  }

  if (!Number.isFinite(feeEGP) || feeEGP <= 0) {
    return res.status(400).json({ message: "Service fee amount is invalid" });
  }

  await expireStalePendingServiceFeeCheckouts({
    userId: req.userId,
    swapId: swap._id,
    side,
  });

  const existingPendingTransactions = await Transaction.find({
    user: req.userId,
    swap: swap._id,
    type: "service_fee",
    status: { $in: ACTIVE_SERVICE_FEE_CHECKOUT_STATUSES },
    "metadata.provider": "paymob",
    "metadata.serviceFeeSide": side,
    "metadata.paymobFinalFailureVerifiedAt": { $exists: false },
  }).sort({ createdAt: -1 });
  const reusablePending = existingPendingTransactions.find(
    (transaction) => getPaymobCheckoutUrls(transaction).canContinue
  );

  if (reusablePending) {
    const checkout = getPaymobCheckoutUrls(reusablePending);

    return res.json({
      message: "Service fee checkout already pending",
      provider: "paymob",
      purpose: "service_fee",
      side,
      amountEGP: feeEGP,
      transaction: serializeTransaction(reusablePending),
      checkoutUrl: checkout.checkoutUrl,
      paymentUrl: checkout.paymentUrl,
      iframeUrl: checkout.iframeUrl,
      canContinue: true,
      swap: serializeServiceFeeSwap(swap),
    });
  }

  const unusablePendingIds = existingPendingTransactions.map((transaction) => transaction._id);
  if (unusablePendingIds.length > 0) {
    await Transaction.updateMany(
      { _id: { $in: unusablePendingIds }, status: "pending" },
      {
        $set: {
          status: "expired",
          description: "Swap service fee checkout expired because checkout URL was unavailable",
          "metadata.paymobExpiredAt": new Date(),
          "metadata.paymobExpiryReason": "missing checkout URL",
        },
      }
    );
  }

  const transaction = await Transaction.create({
    user: user._id,
    swap: swap._id,
    type: "service_fee",
    direction: "debit",
    amount: feeEGP,
    currency: SERVICE_FEE_CURRENCY,
    status: "pending",
    description: `Pending ${side} service fee via Paymob`,
    metadata: {
      purpose: "service_fee",
      payment_type: "service_fee",
      provider: "paymob",
      serviceFeeSide: side,
      serviceFeeEGP: feeEGP,
      paymobCurrency: getPaymobCurrency(),
      swap_id: String(swap._id),
      payer_user_id: String(user._id),
    },
  });

  const merchantOrderId = `svcfee_${transaction._id}`;

  try {
    const checkout = await createPaymobCheckoutSession({
      user,
      transactionId: transaction._id,
      merchantOrderId,
      payment: {
        type: "service_fee",
        amountEGP: feeEGP,
        name: "Swap service fee",
        description: `${side} service fee for swap ${swap._id}`,
      },
    });

    const updatedTransaction = await Transaction.findByIdAndUpdate(
      transaction._id,
      {
        $set: {
          "metadata.transaction_id": String(transaction._id),
          "metadata.transactionId": String(transaction._id),
          "metadata.merchantOrderId": merchantOrderId,
          "metadata.merchant_order_id": merchantOrderId,
          "metadata.paymobOrderId": checkout.orderId,
          "metadata.paymob_order_id": checkout.orderId,
          "metadata.paymobIntegrationId": checkout.integrationId,
          "metadata.paymobAmountCents": checkout.amountCents,
          "metadata.paymobCurrency": checkout.currency,
          "metadata.paymobIframeId": process.env.PAYMOB_IFRAME_ID,
          "metadata.paymobPaymentUrl": checkout.paymentUrl,
          "metadata.paymobIframeUrl": checkout.iframeUrl,
          "metadata.paymobSuccessUrl": checkout.successUrl,
          "metadata.paymobFailureUrl": checkout.failureUrl,
        },
      },
      { returnDocument: "after" }
    );

    logPaymob("info", "service fee checkout created", {
      requestId: req.requestId,
      transactionId: updatedTransaction?._id || transaction._id,
      swapId: swap._id,
      payerUserId: user._id,
      paymobOrderId: checkout.orderId,
      merchantOrderId,
      amountCents: checkout.amountCents,
      currency: checkout.currency,
    });

    return res.status(201).json({
      message: "Paymob service fee checkout created",
      provider: "paymob",
      purpose: "service_fee",
      side,
      amountEGP: feeEGP,
      transaction: serializeTransaction(updatedTransaction),
      checkoutUrl: checkout.paymentUrl,
      paymentUrl: checkout.paymentUrl,
      iframeUrl: checkout.iframeUrl,
      canContinue: true,
      successUrl: checkout.successUrl,
      failureUrl: checkout.failureUrl,
      swap: serializeServiceFeeSwap(swap),
    });
  } catch (error) {
    await Transaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          status: "failed",
          description: "Swap service fee checkout could not be started",
          "metadata.merchantOrderId": merchantOrderId,
          "metadata.merchant_order_id": merchantOrderId,
          "metadata.paymobFailureReason": error.message,
        },
      }
    );

    throw error;
  }
});

exports.reconcileServiceFeeForSwap = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const swap = await SwapRequest.findOne({
    _id: req.params.id,
    $or: [{ requester: req.userId }, { receiver: req.userId }],
  });

  if (!swap) {
    return res.status(404).json({ message: "Swap request not found" });
  }

  const side = String(swap.requester) === String(req.userId) ? "requester" : "receiver";
  const paidField = getServiceFeePaidField(side);

  if (swap[paidField]) {
    const completedTransaction = await Transaction.findOne({
      user: req.userId,
      swap: swap._id,
      type: "service_fee",
      status: "completed",
      "metadata.provider": "paymob",
      "metadata.serviceFeeSide": side,
    }).sort({ updatedAt: -1 });

    if (completedTransaction) {
      return sendPaymobReturnResponse(res, 200, {
        message: "Service fee already confirmed",
        status: "completed",
        success: true,
        swap,
        transaction: completedTransaction,
      });
    }

    return res.json({
      success: true,
      status: "completed",
      purpose: "service_fee",
      message: "Service fee already confirmed",
      swapId: String(swap._id),
      swap: serializeServiceFeeSwap(swap),
    });
  }

  const serviceFeeTransactions = await Transaction.find({
    user: req.userId,
    swap: swap._id,
    type: "service_fee",
    "metadata.provider": "paymob",
    "metadata.serviceFeeSide": side,
  }).sort({ updatedAt: -1, createdAt: -1 });
  const completedUnappliedTransaction = serviceFeeTransactions.find(
    (item) => item.status === "completed" && !item.metadata?.serviceFeeAppliedAt
  );
  const activePendingTransaction = serviceFeeTransactions.find((item) =>
    ACTIVE_SERVICE_FEE_CHECKOUT_STATUSES.includes(item.status)
  );
  const inactiveTransaction = serviceFeeTransactions.find((item) =>
    INACTIVE_SERVICE_FEE_CHECKOUT_STATUSES.includes(item.status)
  );
  const transaction =
    completedUnappliedTransaction || activePendingTransaction || inactiveTransaction || null;
  const matchedBy = completedUnappliedTransaction
    ? "completed_unapplied"
    : activePendingTransaction
      ? "active_pending"
      : inactiveTransaction
        ? "inactive_historical"
        : undefined;

  logPaymob(transaction ? "info" : "warn", "service fee reconcile transaction lookup", {
    requestId: req.requestId,
    swapId: swap._id,
    userId: req.userId,
    side,
    found: Boolean(transaction),
    matchedBy,
    transactionId: transaction?._id,
    status: transaction?.status,
    finalFailureVerified: Boolean(transaction?.metadata?.paymobFinalFailureVerifiedAt),
    candidateCount: serviceFeeTransactions.length,
  });

  if (!transaction) {
    return res.status(404).json({
      success: false,
      status: "unpaid",
      purpose: "service_fee",
      message: "No service fee Paymob transaction found",
      reason: "No service fee Paymob transaction was found for this swap.",
      swapId: String(swap._id),
      swap: serializeServiceFeeSwap(swap),
    });
  }

  if (!completedUnappliedTransaction && !activePendingTransaction) {
    const reason =
      transaction.metadata?.paymobPendingReason ||
      transaction.metadata?.paymobFailureReason ||
      (transaction.status === "expired"
        ? "service fee checkout expired"
        : "service fee payment is not active");

    return sendPaymobReturnResponse(res, transaction.status === "failed" ? 400 : 409, {
      message:
        transaction.status === "failed"
          ? "Paymob payment was not approved"
          : "No active service fee checkout was found",
      reason,
      status: transaction.status,
      success: false,
      swap,
      transaction,
    });
  }

  logPaymob("info", "service fee reconcile started", {
    requestId: req.requestId,
    source: "user-service-fee-reconcile",
    transactionId: transaction._id,
    swapId: swap._id,
    side,
    paymobOrderId: transaction.metadata?.paymobOrderId,
    paymobTransactionId: transaction.metadata?.paymobTransactionId,
    merchantOrderId: transaction.metadata?.merchantOrderId,
  });

  const result = await reconcileServiceFeeTransaction({
    transaction,
    source: "user-service-fee-reconcile",
    requestId: req.requestId,
  });

  return sendPaymobReturnResponse(res, result.statusCode, {
    message: result.message,
    reason: result.success ? undefined : result.reason,
    status: result.status,
    success: result.success,
    swap: result.swap || swap,
    transaction: result.transaction || transaction,
  });
});

exports.createCoinPackageCheckout = asyncHandler(async (req, res) => {
  const packageId = getString(req.body.packageId);
  const coinPackage = getCoinPackage(packageId);

  if (!coinPackage) {
    return res.status(400).json({ message: "Invalid coin package" });
  }

  const user = await User.findOne({ _id: req.userId, is_deleted: { $ne: true } });

  if (!user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  try {
    const cleanup = await expireStalePendingPaymobPurchases();

    if (cleanup.modifiedCount > 0) {
      logPaymob("info", "stale pending package purchases expired", {
        expiredCount: cleanup.modifiedCount,
        olderThanMinutes: DEFAULT_PENDING_EXPIRY_MINUTES,
      });
    }
  } catch (error) {
    logPaymob("warn", "stale pending cleanup skipped", { reason: error.message });
  }

  const existingPendingTransactions = await Transaction.find({
    user: user._id,
    type: "package_purchase_pending",
    status: "pending",
    "metadata.provider": "paymob",
    "metadata.packageId": coinPackage.id,
  }).sort({ createdAt: -1 });
  const reusablePending = existingPendingTransactions.find(
    (transaction) => getPaymobCheckoutUrls(transaction).canContinue
  );

  if (reusablePending) {
    const checkout = getPaymobCheckoutUrls(reusablePending);

    return res.json({
      message: "Coin package checkout already pending",
      provider: "paymob",
      package: serializeCoinPackage(coinPackage),
      transaction: serializeTransaction(reusablePending),
      checkoutUrl: checkout.checkoutUrl,
      paymentUrl: checkout.paymentUrl,
      iframeUrl: checkout.iframeUrl,
      canContinue: true,
      successUrl: reusablePending.metadata?.paymobSuccessUrl || "",
      failureUrl: reusablePending.metadata?.paymobFailureUrl || "",
    });
  }

  const unusablePendingIds = existingPendingTransactions.map((transaction) => transaction._id);
  if (unusablePendingIds.length > 0) {
    await Transaction.updateMany(
      { _id: { $in: unusablePendingIds }, status: "pending" },
      {
        $set: {
          status: "expired",
          description: "Coin package checkout expired because checkout URL was unavailable",
          "metadata.paymobExpiredAt": new Date(),
          "metadata.paymobExpiryReason": "missing checkout URL",
        },
      }
    );
  }

  const transaction = await Transaction.create({
    user: user._id,
    type: "package_purchase_pending",
    direction: "credit",
    amount: coinPackage.coins,
    currency: "coins",
    status: "pending",
    description: `Pending purchase of ${coinPackage.coins} coins via Paymob`,
    metadata: {
      purpose: "coin_package",
      payment_type: "coin_purchase",
      packageId: coinPackage.id,
      priceEGP: coinPackage.priceEGP,
      provider: "paymob",
      paymobCurrency: getPaymobCurrency(),
      payer_user_id: String(user._id),
    },
  });

  const merchantOrderId = `coinpkg_${transaction._id}`;

  try {
    const checkout = await createPaymobCheckoutSession({
      user,
      coinPackage,
      transactionId: transaction._id,
      merchantOrderId,
    });

    const updatedTransaction = await Transaction.findByIdAndUpdate(
      transaction._id,
      {
        $set: {
          "metadata.transaction_id": String(transaction._id),
          "metadata.transactionId": String(transaction._id),
          "metadata.payer_user_id": String(user._id),
          "metadata.merchantOrderId": merchantOrderId,
          "metadata.merchant_order_id": merchantOrderId,
          "metadata.paymobOrderId": checkout.orderId,
          "metadata.paymob_order_id": checkout.orderId,
          "metadata.paymobIntegrationId": checkout.integrationId,
          "metadata.paymobAmountCents": checkout.amountCents,
          "metadata.paymobCurrency": checkout.currency,
          "metadata.paymobIframeId": process.env.PAYMOB_IFRAME_ID,
          "metadata.paymobPaymentUrl": checkout.paymentUrl,
          "metadata.paymobIframeUrl": checkout.iframeUrl,
          "metadata.paymobSuccessUrl": checkout.successUrl,
          "metadata.paymobFailureUrl": checkout.failureUrl,
        },
      },
      { returnDocument: "after" }
    );

    return res.status(201).json({
      message: "Paymob checkout created",
      provider: "paymob",
      package: serializeCoinPackage(coinPackage),
      transaction: serializeTransaction(updatedTransaction),
      checkoutUrl: checkout.paymentUrl,
      paymentUrl: checkout.paymentUrl,
      iframeUrl: checkout.iframeUrl,
      canContinue: true,
      successUrl: checkout.successUrl,
      failureUrl: checkout.failureUrl,
    });
  } catch (error) {
    await Transaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          status: "failed",
          description: "Coin package checkout could not be started",
          "metadata.merchantOrderId": merchantOrderId,
          "metadata.paymobFailureReason": error.message,
        },
      }
    );

    throw error;
  }
});

exports.handlePaymobWebhook = asyncHandler(async (req, res) => {
  const receivedHmac = getString(req.query.hmac) || getString(req.body?.hmac);

  logPaymob("info", "webhook received", {
    requestId: req.requestId,
    hasHmac: Boolean(receivedHmac),
    payloadType: req.body?.type,
  });

  if (!verifyPaymobHmac(req.body, receivedHmac)) {
    logPaymob("warn", "webhook rejected", {
      requestId: req.requestId,
      reason: "invalid hmac",
    });

    return res.status(401).json({ message: "Invalid Paymob webhook signature" });
  }

  logPaymob("info", "HMAC verified", { requestId: req.requestId });

  const eventObject = getPaymentObject(req.body);
  const webhookMetadata = getWebhookMetadata(eventObject);
  const lookupResult = await findPaymobTransactionWithMatch({
    paymobOrderId: webhookMetadata.paymobOrderId,
    paymobTransactionId: webhookMetadata.paymobTransactionId,
    merchantOrderId: webhookMetadata.merchantOrderId,
  });
  const transaction = lookupResult.transaction;

  if (!transaction) {
    logPaymob("warn", "webhook rejected", {
      requestId: req.requestId,
      reason: "matching transaction not found",
      paymobOrderId: webhookMetadata.paymobOrderId,
      paymobTransactionId: webhookMetadata.paymobTransactionId,
      merchantOrderId: webhookMetadata.merchantOrderId,
    });

    return res.status(404).json({ message: "Matching Paymob transaction not found" });
  }

  logPaymob("info", "transaction matched", {
    requestId: req.requestId,
    transactionId: transaction._id,
    matchedBy: lookupResult.matchedBy,
    purpose: getPaymentPurpose(transaction),
    paymobOrderId: webhookMetadata.paymobOrderId,
    paymobTransactionId: webhookMetadata.paymobTransactionId,
    merchantOrderId: webhookMetadata.merchantOrderId,
    success: webhookMetadata.paymobSuccess,
    pending: webhookMetadata.paymobPending,
    errorOccurred: webhookMetadata.paymobErrorOccurred,
    txnResponseCode: webhookMetadata.paymobTxnResponseCode,
  });

  const result = await processPaymobPayment({
    transaction,
    eventObject,
    metadata: webhookMetadata,
    source: "webhook",
    ...(getPaymentPurpose(transaction) === "service_fee"
      ? { keepPendingOnIncomplete: true, incompletePaymentStatusCode: 200 }
      : {}),
  });

  return res.status(result.statusCode).json({
    message: result.message,
    transaction: serializeTransaction(result.transaction),
    swap: serializeServiceFeeSwap(result.swap),
  });
});

exports.confirmPaymobReturn = asyncHandler(async (req, res) => {
  const returnQuery = normalizeReturnQuery(req.body?.query);

  logPaymob("info", "return confirmation received", {
    requestId: req.requestId,
    hasQuery: Boolean(returnQuery),
    hasHmac: Boolean(returnQuery?.hmac),
  });

  if (!returnQuery) {
    return res.status(400).json({
      success: false,
      status: "pending",
      message: "Paymob return query is required",
      reason: "Paymob return query is required.",
    });
  }

  const receivedHmac = getString(returnQuery.hmac);
  let eventObject = getPaymentObject(returnQuery);
  let returnMetadata = getWebhookMetadata(eventObject);
  const lookupResult = await findPaymobTransactionWithMatch({
    paymobOrderId: returnMetadata.paymobOrderId,
    paymobTransactionId: returnMetadata.paymobTransactionId,
    merchantOrderId: returnMetadata.merchantOrderId,
  });
  const transaction = lookupResult.transaction;
  const returnPurpose = transaction ? getPaymentPurpose(transaction) : undefined;

  logPaymob("info", "return identifiers parsed", {
    requestId: req.requestId,
    paymobOrderId: returnMetadata.paymobOrderId,
    paymobTransactionId: returnMetadata.paymobTransactionId,
    merchantOrderId: returnMetadata.merchantOrderId,
    matchedBy: lookupResult.matchedBy,
    transactionId: transaction?._id,
    detectedPurpose: returnPurpose,
    success: returnMetadata.paymobSuccess,
    pending: returnMetadata.paymobPending,
    errorOccurred: returnMetadata.paymobErrorOccurred,
    txnResponseCode: returnMetadata.paymobTxnResponseCode,
    integrationId: returnMetadata.paymobIntegrationId,
    amountCents: returnMetadata.paymobAmountCents,
    currency: returnMetadata.paymobCurrency,
  });

  if (receivedHmac && !verifyPaymobHmac(returnQuery, receivedHmac)) {
    logPaymob("warn", "return confirmation rejected", {
      requestId: req.requestId,
      reason: "invalid hmac",
      transactionId: transaction?._id,
      purpose: transaction ? getPaymentPurpose(transaction) : undefined,
    });

    if (transaction && String(transaction.user) === String(req.userId)) {
      return sendPaymobReturnResponse(res, 401, {
        message: "Invalid Paymob return signature",
        reason: "invalid hmac",
        status: transaction.status || "pending",
        success: false,
        transaction,
      });
    }

    return res.status(401).json({
      success: false,
      status: "pending",
      message: "Invalid Paymob return signature",
      reason: getPaymobReturnReasonMessage("invalid hmac"),
    });
  }

  if (receivedHmac) {
    logPaymob("info", "return HMAC verified", { requestId: req.requestId });
  } else {
    logPaymob("warn", "return confirmation pending", {
      requestId: req.requestId,
      reason: "missing hmac",
      transactionId: transaction?._id,
      purpose: transaction ? getPaymentPurpose(transaction) : undefined,
    });
  }

  if (!transaction) {
    logPaymob("warn", "return confirmation rejected", {
      requestId: req.requestId,
      reason: "matching transaction not found",
      paymobOrderId: returnMetadata.paymobOrderId,
      paymobTransactionId: returnMetadata.paymobTransactionId,
      merchantOrderId: returnMetadata.merchantOrderId,
    });

    return res.status(404).json({
      success: false,
      status: "pending",
      message: "Matching Paymob transaction not found",
      reason: getPaymobReturnReasonMessage("matching transaction not found"),
    });
  }

  if (String(transaction.user) !== String(req.userId)) {
    logPaymob("warn", "return confirmation rejected", {
      requestId: req.requestId,
      reason: "transaction user mismatch",
      transactionId: transaction._id,
    });

    return res.status(403).json({ message: "Paymob transaction does not belong to this user" });
  }

  if (getPaymentPurpose(transaction) === "service_fee") {
    logPaymob("info", "service fee return using server verification", {
      requestId: req.requestId,
      transactionId: transaction._id,
      swapId: transaction.swap,
      paymobOrderId: returnMetadata.paymobOrderId,
      paymobTransactionId: returnMetadata.paymobTransactionId,
      merchantOrderId: returnMetadata.merchantOrderId,
      returnSuccess: returnMetadata.paymobSuccess,
      returnPending: returnMetadata.paymobPending,
      returnErrorOccurred: returnMetadata.paymobErrorOccurred,
      returnTxnResponseCode: returnMetadata.paymobTxnResponseCode,
    });

    const result = await reconcileServiceFeeTransaction({
      transaction,
      source: "return-server-reconcile",
      requestId: req.requestId,
      lookupMetadata: returnMetadata,
    });

    return sendPaymobReturnResponse(res, result.statusCode, {
      message: result.message,
      reason: result.success ? undefined : result.reason,
      status: result.status,
      success: result.success,
      swap: result.swap,
      transaction: result.transaction || transaction,
    });
  }

  let source = "return";

  if (!receivedHmac) {
    try {
      const paymobStatus = await fetchPaymobPaymentStatus({
        paymobTransactionId: returnMetadata.paymobTransactionId || transaction.metadata?.paymobTransactionId,
        paymobOrderId: returnMetadata.paymobOrderId || transaction.metadata?.paymobOrderId,
        merchantOrderId: returnMetadata.merchantOrderId || transaction.metadata?.merchantOrderId,
      });

      eventObject = getPaymentObject(paymobStatus);
      returnMetadata = mergeStoredPaymobMetadata(getWebhookMetadata(eventObject), transaction);
      source = "return-reconcile";
    } catch (error) {
      logPaymob("warn", "return confirmation pending", {
        requestId: req.requestId,
        reason: "server verification failed",
        transactionId: transaction._id,
        purpose: getPaymentPurpose(transaction),
        paymobOrderId: returnMetadata.paymobOrderId,
        paymobTransactionId: returnMetadata.paymobTransactionId,
        merchantOrderId: returnMetadata.merchantOrderId,
        error: error.message,
      });

      return sendPaymobReturnResponse(res, 202, {
        message: "Paymob confirmation is pending",
        reason: "server verification failed",
        status: transaction.status || "pending",
        success: false,
        transaction,
      });
    }
  }

  logPaymob("info", "transaction matched", {
    requestId: req.requestId,
    source,
    transactionId: transaction._id,
    paymobOrderId: returnMetadata.paymobOrderId,
    paymobTransactionId: returnMetadata.paymobTransactionId,
    merchantOrderId: returnMetadata.merchantOrderId,
  });

  const expectedIntegrationId = getExpectedIntegrationId(transaction);

  if (
    !returnMetadata.paymobIntegrationId ||
    !expectedIntegrationId ||
    returnMetadata.paymobIntegrationId !== expectedIntegrationId
  ) {
    logPaymob("warn", "return confirmation rejected", {
      requestId: req.requestId,
      reason: "integration id mismatch",
      transactionId: transaction._id,
      purpose: getPaymentPurpose(transaction),
      paymobIntegrationId: returnMetadata.paymobIntegrationId,
      expectedIntegrationId,
    });

    return sendPaymobReturnResponse(res, 400, {
      message: "Paymob integration id mismatch",
      reason: "integration id mismatch",
      status: transaction.status || "pending",
      success: false,
      transaction,
    });
  }

  const result = await processPaymobPayment({
    transaction,
    eventObject,
    metadata: returnMetadata,
    source,
    incompletePaymentStatusCode: 400,
  });

  const resultTransaction = result.transaction || transaction;
  const purpose = getPaymentPurpose(resultTransaction);
  const resultStatus = resultTransaction?.status || transaction.status || "pending";
  const success = resultStatus === "completed";
  const wallet = purpose === "coin_package" ? await getWalletSummary(transaction.user) : undefined;
  const reason = success ? undefined : result.reason || resultTransaction?.metadata?.paymobFailureReason;

  if (purpose === "service_fee" && result.reason) {
    const logMessage = success
      ? "return confirmation resolved"
      : resultStatus === "failed"
        ? "return confirmation failed"
        : "return confirmation pending";

    logPaymob(success ? "info" : "warn", logMessage, {
      requestId: req.requestId,
      reason: result.reason,
      transactionId: resultTransaction._id,
      purpose,
      status: resultStatus,
    });
  }

  return sendPaymobReturnResponse(res, result.statusCode, {
    message: result.message,
    reason,
    status: resultStatus,
    success,
    swap: result.swap,
    transaction: resultTransaction,
    wallet,
  });
});

exports.reconcilePaymobPayment = asyncHandler(async (req, res) => {
  const transactionId = getString(req.params.transactionId);

  if (!isMongoObjectId(transactionId)) {
    return res.status(400).json({ message: "Invalid transaction id" });
  }

  const transaction = await Transaction.findOne({
    _id: transactionId,
    "metadata.provider": "paymob",
  });

  if (!transaction) {
    return res.status(404).json({ message: "Paymob transaction not found" });
  }

  logPaymob("info", "reconcile started", {
    requestId: req.requestId,
    transactionId: transaction._id,
    status: transaction.status,
    paymobOrderId: transaction.metadata?.paymobOrderId,
    paymobTransactionId: transaction.metadata?.paymobTransactionId,
    merchantOrderId: transaction.metadata?.merchantOrderId,
  });

  if (
    transaction.status === "completed" &&
    (transaction.metadata?.coinCreditedAt || transaction.metadata?.serviceFeeAppliedAt)
  ) {
    logPaymob("info", "duplicate webhook ignored", {
      source: "reconcile",
      transactionId: transaction._id,
      status: transaction.status,
    });

    return res.json({
      message: "Paymob webhook already processed",
      transaction: serializeTransaction(transaction),
    });
  }

  if (getPaymentPurpose(transaction) === "service_fee") {
    const result = await reconcileServiceFeeTransaction({
      transaction,
      source: "admin-service-fee-reconcile",
      requestId: req.requestId,
    });

    return sendPaymobReturnResponse(res, result.statusCode, {
      message: result.message,
      reason: result.success ? undefined : result.reason,
      status: result.status,
      success: result.success,
      swap: result.swap,
      transaction: result.transaction || transaction,
    });
  }

  const paymobStatus = await fetchPaymobPaymentStatus({
    paymobTransactionId: transaction.metadata?.paymobTransactionId,
    paymobOrderId: transaction.metadata?.paymobOrderId,
    merchantOrderId: transaction.metadata?.merchantOrderId,
  });
  const eventObject = getPaymentObject(paymobStatus);
  const metadata = mergeStoredPaymobMetadata(getWebhookMetadata(eventObject), transaction);

  const result = await processPaymobPayment({
    transaction,
    eventObject,
    metadata,
    source: "reconcile",
  });

  return res.status(result.statusCode).json({
    message: result.message,
    transaction: serializeTransaction(result.transaction),
    swap: serializeServiceFeeSwap(result.swap),
  });
});

exports.expireStalePaymobPendingPurchases = asyncHandler(async (req, res) => {
  const olderThanMinutes = toNumber(req.body?.olderThanMinutes ?? req.query?.olderThanMinutes);
  const result = await expireStalePendingPaymobPurchases({
    olderThanMinutes: olderThanMinutes || DEFAULT_PENDING_EXPIRY_MINUTES,
  });

  logPaymob("info", "stale pending package purchases expired", {
    requestId: req.requestId,
    expiredCount: result.modifiedCount,
    olderThanMinutes: olderThanMinutes || DEFAULT_PENDING_EXPIRY_MINUTES,
  });

  return res.json({
    message: "Stale Paymob pending purchases expired",
    expiredCount: result.modifiedCount,
  });
});
