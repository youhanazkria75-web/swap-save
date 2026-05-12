require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const SwapRequest = require("../src/models/SwapRequest");
const Transaction = require("../src/models/Transaction");
const { createSwapTimelineEvent } = require("../src/utils/swapTimeline");
const { refundCompensationCoins } = require("../src/utils/swapCompensation");

const DEFAULT_TITLE_A = "\u062b\u0644\u0627\u062b \u0648\u0631\u0642\u0627\u062a";
const DEFAULT_TITLE_B = "\u0648\u0631\u0642\u062a\u064a\u0646";

const args = process.argv.slice(2);
const applyChanges = args.includes("--apply");
const showOnly = args.includes("--show");

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
};

const titleA = getArgValue("--title-a") || DEFAULT_TITLE_A;
const titleB = getArgValue("--title-b") || DEFAULT_TITLE_B;
const targetSwapId = getArgValue("--swap-id");

if (!process.env.MONGO_URI) {
  console.error("Missing MONGO_URI. Check back-end/.env before running repair.");
  process.exit(1);
}

const getProductSnapshot = (product) => ({
  id: String(product._id),
  title: product.title,
  status: product.status,
});

const getSwapSnapshot = (swap) => ({
  id: String(swap._id),
  status: swap.status,
  product_offered: getProductSnapshot(swap.product_offered),
  product_requested: getProductSnapshot(swap.product_requested),
  compensation_status: swap.compensation_status || "none",
  compensation_amount: Number(swap.compensation_amount || 0),
  compensation_payer: swap.compensation_payer ? String(swap.compensation_payer) : null,
});

const findTargetSwap = async () => {
  if (targetSwapId) {
    if (!mongoose.isValidObjectId(targetSwapId)) {
      throw new Error("--swap-id must be a valid ObjectId");
    }

    const swapQuery = showOnly
      ? { _id: targetSwapId }
      : { _id: targetSwapId, status: "disputed" };

    const swap = await SwapRequest.find(swapQuery)
      .populate("product_offered", "title status")
      .populate("product_requested", "title status");

    return {
      titleAProducts: [],
      titleBProducts: [],
      swaps: swap,
    };
  }

  const [titleAProducts, titleBProducts] = await Promise.all([
    Product.find({ title: titleA }).select("_id title status"),
    Product.find({ title: titleB }).select("_id title status"),
  ]);

  const titleAIds = titleAProducts.map((product) => product._id);
  const titleBIds = titleBProducts.map((product) => product._id);

  const swaps = await SwapRequest.find({
    status: "disputed",
    $or: [
      { product_offered: { $in: titleAIds }, product_requested: { $in: titleBIds } },
      { product_offered: { $in: titleBIds }, product_requested: { $in: titleAIds } },
    ],
  })
    .populate("product_offered", "title status")
    .populate("product_requested", "title status")
    .sort({ updatedAt: -1 });

  return {
    titleAProducts,
    titleBProducts,
    swaps,
  };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const { titleAProducts, titleBProducts, swaps } = await findTargetSwap();

  if (showOnly) {
    const swap = swaps[0];
    const timelineEvents = swap
      ? await require("../src/models/SwapTimelineEvent")
          .find({ swap: swap._id, event: "legacy_dispute_cancelled" })
          .select("_id event createdAt")
          .sort({ createdAt: -1 })
      : [];
    const refundTransactions = swap
      ? await Transaction.find({ swap: swap._id, type: "coin_refund" })
          .select("_id user amount status createdAt")
          .sort({ createdAt: -1 })
      : [];

    console.log(JSON.stringify({
      mode: "show",
      swap: swap ? getSwapSnapshot(swap) : null,
      refundTransactions: refundTransactions.map((transaction) => ({
        id: String(transaction._id),
        user: String(transaction.user),
        amount: transaction.amount,
        status: transaction.status,
        createdAt: transaction.createdAt,
      })),
      timelineEvents: timelineEvents.map((event) => ({
        id: String(event._id),
        event: event.event,
        createdAt: event.createdAt,
      })),
    }, null, 2));
    return;
  }

  if (swaps.length !== 1) {
    const disputedSwaps = await SwapRequest.find({ status: "disputed" })
      .populate("product_offered", "title status")
      .populate("product_requested", "title status")
      .sort({ updatedAt: -1 });

    console.log(JSON.stringify({
      mode: applyChanges ? "apply" : "dry-run",
      error: "Expected exactly one matching disputed swap.",
      titleA,
      titleB,
      titleAMatches: titleAProducts.map(getProductSnapshot),
      titleBMatches: titleBProducts.map(getProductSnapshot),
      matchingSwaps: swaps.map(getSwapSnapshot),
      allDisputedSwaps: disputedSwaps.map(getSwapSnapshot),
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const swap = swaps[0];
  const before = getSwapSnapshot(swap);
  const productIds = [swap.product_offered._id, swap.product_requested._id];

  const plan = {
    mode: applyChanges ? "apply" : "dry-run",
    target: `${titleA} <-> ${titleB}`,
    before,
    updates: {
      swap: {
        id: String(swap._id),
        from: swap.status,
        to: "cancelled",
      },
      products: before.product_offered && before.product_requested
        ? [
            { id: before.product_offered.id, title: before.product_offered.title, from: before.product_offered.status, to: "available" },
            { id: before.product_requested.id, title: before.product_requested.title, from: before.product_requested.status, to: "available" },
          ]
        : [],
      compensationRefund: swap.compensation_status === "held"
        ? {
            payer: swap.compensation_payer ? String(swap.compensation_payer) : null,
            amount: Number(swap.compensation_amount || 0),
          }
        : null,
      timelineEvent: "legacy_dispute_cancelled",
    },
  };

  if (!applyChanges) {
    console.log(JSON.stringify(plan, null, 2));
    console.log("Dry run only. Re-run with --apply to update this one swap.");
    return;
  }

  const startedAt = new Date();

  swap.status = "cancelled";
  await swap.save();

  const refundResult = await refundCompensationCoins(swap);

  const productResult = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { status: "available" } }
  );

  const timelineEvent = await createSwapTimelineEvent({
    swap,
    event: "legacy_dispute_cancelled",
    description: "Legacy disputed swap manually cancelled after resolved report consistency repair.",
    actor: "system",
  });

  const refundTransactions = refundResult.moved
    ? await Transaction.find({
        swap: swap._id,
        type: "coin_refund",
        createdAt: { $gte: startedAt },
      })
        .select("_id user amount status createdAt")
        .sort({ createdAt: -1 })
    : [];

  const [updatedSwap, updatedProducts] = await Promise.all([
    SwapRequest.findById(swap._id).select("_id status compensation_status compensation_amount"),
    Product.find({ _id: { $in: productIds } }).select("_id title status"),
  ]);

  console.log(JSON.stringify({
    mode: "apply",
    updated: {
      swap: {
        id: String(updatedSwap._id),
        from: before.status,
        to: updatedSwap.status,
        compensation_status: updatedSwap.compensation_status,
        compensation_amount: Number(updatedSwap.compensation_amount || 0),
      },
      products: updatedProducts.map((product) => ({
        id: String(product._id),
        title: product.title,
        status: product.status,
      })),
      productUpdateResult: {
        matched: productResult.matchedCount ?? productResult.n ?? 0,
        modified: productResult.modifiedCount ?? productResult.nModified ?? 0,
      },
      compensationRefund: {
        moved: Boolean(refundResult.moved),
        amount: refundResult.amount || 0,
        payer: refundResult.payer ? String(refundResult.payer) : null,
        transactionIds: refundTransactions.map((transaction) => String(transaction._id)),
      },
      timelineEvent: timelineEvent
        ? {
            id: String(timelineEvent._id),
            event: timelineEvent.event,
          }
        : null,
    },
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
