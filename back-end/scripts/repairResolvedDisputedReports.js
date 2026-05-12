require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const Report = require("../src/models/Report");
const SwapRequest = require("../src/models/SwapRequest");
const Product = require("../src/models/Product");
const { createSwapTimelineEvent } = require("../src/utils/swapTimeline");
const { refundCompensationCoins } = require("../src/utils/swapCompensation");

const RESTORABLE_DISPUTE_STATUSES = [
  "pending",
  "in_discussion",
  "under_review",
  "approved",
  "payment_pending",
  "exchange_setup",
  "in_progress",
];

const args = process.argv.slice(2);
const applyChanges = args.includes("--apply");

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
};

const legacyResolvedAction = getArgValue("--legacy-resolved-action");
const targetReportId = getArgValue("--report-id");

if (
  legacyResolvedAction &&
  !["cancel_swap", "continue_swap"].includes(legacyResolvedAction)
) {
  console.error("--legacy-resolved-action must be cancel_swap or continue_swap");
  process.exit(1);
}

if (legacyResolvedAction && !targetReportId) {
  console.error("--legacy-resolved-action requires --report-id so legacy resolved reports are repaired one at a time.");
  process.exit(1);
}

if (!process.env.MONGO_URI) {
  console.error("Missing MONGO_URI. Check back-end/.env before running repair.");
  process.exit(1);
}

const getActionForReport = (report) => {
  if (report.resolution_action) {
    return report.resolution_action;
  }

  if (report.status === "dismissed") {
    return "dismiss";
  }

  if (report.status === "resolved" && legacyResolvedAction) {
    return legacyResolvedAction;
  }

  return "";
};

const isSafeRestoreStatus = (status) =>
  RESTORABLE_DISPUTE_STATUSES.includes(status);

const repairReport = async (report) => {
  const swap = await SwapRequest.findById(report.swap);

  if (!swap || swap.status !== "disputed") {
    return { skipped: true, reason: "Related swap is not disputed" };
  }

  const action = getActionForReport(report);

  if (!action) {
    return {
      warning: true,
      reason:
        "Resolved legacy report has no resolution_action. Re-run with --report-id=<id> and --legacy-resolved-action=continue_swap or cancel_swap only if that matches the admin's original decision.",
      reportId: String(report._id),
      swapId: String(swap._id),
      previousSwapStatus: report.previous_swap_status || null,
    };
  }

  if (action === "cancel_swap") {
    const plan = {
      reportId: String(report._id),
      swapId: String(swap._id),
      action,
      from: swap.status,
      to: "cancelled",
      productsToRelease: [String(swap.product_offered), String(swap.product_requested)],
      compensationStatus: swap.compensation_status || "none",
      compensationAmount: Number(swap.compensation_amount || 0),
    };

    if (!applyChanges) {
      return { planned: true, plan };
    }

    swap.status = "cancelled";
    await swap.save();

    const refundResult = await refundCompensationCoins(swap);
    const productResult = await Product.updateMany(
      { _id: { $in: [swap.product_offered, swap.product_requested] } },
      { $set: { status: "available" } }
    );

    if (!report.resolution_action) {
      report.resolution_action = action;
      await report.save();
    }

    await createSwapTimelineEvent({
      swap,
      event: "legacy_dispute_repair",
      description:
        "Legacy resolved report repaired: disputed swap marked cancelled and related products released.",
      actor: "system",
    });

    return {
      repaired: true,
      plan,
      productsModified: productResult.modifiedCount ?? productResult.nModified ?? 0,
      compensationRefunded: Boolean(refundResult.moved),
      refundedAmount: refundResult.amount || 0,
    };
  }

  if (action === "continue_swap" || action === "dismiss") {
    if (!isSafeRestoreStatus(report.previous_swap_status)) {
      return {
        warning: true,
        reason: "Previous swap status is missing or unsafe to restore",
        reportId: String(report._id),
        swapId: String(swap._id),
        action,
        previousSwapStatus: report.previous_swap_status || null,
      };
    }

    const plan = {
      reportId: String(report._id),
      swapId: String(swap._id),
      action,
      from: swap.status,
      to: report.previous_swap_status,
    };

    if (!applyChanges) {
      return { planned: true, plan };
    }

    swap.status = report.previous_swap_status;
    await swap.save();

    if (!report.resolution_action) {
      report.resolution_action = action;
      await report.save();
    }

    await createSwapTimelineEvent({
      swap,
      event: "legacy_dispute_repair",
      description: `Legacy ${report.status} report repaired: disputed swap restored to ${report.previous_swap_status}.`,
      actor: "system",
    });

    return { repaired: true, plan };
  }

  return {
    warning: true,
    reason: `Unsupported resolution action: ${action}`,
    reportId: String(report._id),
    swapId: String(swap._id),
  };
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const query = {
    status: { $in: ["resolved", "dismissed"] },
    swap: { $exists: true, $ne: null },
  };

  if (targetReportId) {
    if (!mongoose.isValidObjectId(targetReportId)) {
      throw new Error("--report-id must be a valid ObjectId");
    }

    query._id = targetReportId;
  }

  const reports = await Report.find(query).sort({ updatedAt: -1 });
  const results = [];

  for (const report of reports) {
    const result = await repairReport(report);
    if (!result.skipped) {
      results.push(result);
    }
  }

  const summary = {
    mode: applyChanges ? "apply" : "dry-run",
    matchedReports: reports.length,
    planned: results.filter((result) => result.planned).length,
    repaired: results.filter((result) => result.repaired).length,
    warnings: results.filter((result) => result.warning).length,
    details: results,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!applyChanges) {
    console.log(
      "Dry run only. Re-run with --apply to write safe repairs. For old resolved reports with no stored action, add --report-id=<id> and --legacy-resolved-action=continue_swap or cancel_swap only after confirming the intended admin decision."
    );
  }
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
