process.env.JWT_SECRET = "test_jwt_secret";

jest.mock("../src/config/email", () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendSupportReplyEmail: jest.fn(),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const User = require("../src/models/User");
const Product = require("../src/models/Product");
const SwapRequest = require("../src/models/SwapRequest");
const Message = require("../src/models/Message");
const Report = require("../src/models/Report");
const Transaction = require("../src/models/Transaction");
const ContactMessage = require("../src/models/ContactMessage");
const Notification = require("../src/models/Notification");
const SwapTimelineEvent = require("../src/models/SwapTimelineEvent");
const BlockedAccount = require("../src/models/BlockedAccount");
const { BLOCKED_ACCOUNT_MESSAGE, hashBlockedEmail } = require("../src/utils/blockedAccounts");
const { sendSupportReplyEmail } = require("../src/config/email");

let mongoServer;
let adminToken;
let userToken;
let normalUser;
let adminUser;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  await mongoose.connect(uri);

  const hashedPassword = await bcrypt.hash("123456", 10);

  normalUser = await User.create({
    first_name: "Normal",
    last_name: "User",
    email: "user@test.com",
    password: hashedPassword,
    isEmailVerified: true,
  });
  userToken = jwt.sign({ userId: normalUser._id }, process.env.JWT_SECRET);

  // create admin user directly with hashed password
  adminUser = await User.create({
    first_name: "Admin",
    last_name: "User",
    email: "admin@test.com",
    password: hashedPassword,
    role: "admin",
    isEmailVerified: true,
  });

  const loginRes = await request(app)
    .post("/auth/login")
    .send({
      email: "admin@test.com",
      password: "123456",
    });

  adminToken = loginRes.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  sendSupportReplyEmail.mockReset();
  sendSupportReplyEmail.mockResolvedValue({ sent: true, skipped: false });
});

const createAdminCancellationSwap = async ({
  requester = normalUser._id,
  receiver,
  status = "approved",
  offeredStatus = "reserved",
  requestedStatus = "reserved",
  swapOverrides = {},
} = {}) => {
  const swapReceiver =
    receiver ||
    await User.create({
      first_name: "Cancel",
      last_name: "Receiver",
      email: `admin-cancel-receiver-${Date.now()}-${Math.random()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: true,
    });
  const suffix = `${Date.now()}-${Math.random()}`;
  const offeredProduct = await Product.create({
    owner_id: requester,
    title: `Admin cancel offered ${suffix}`,
    category: "Electronics",
    condition: "good",
    status: offeredStatus,
  });
  const requestedProduct = await Product.create({
    owner_id: swapReceiver._id || swapReceiver,
    title: `Admin cancel requested ${suffix}`,
    category: "Books",
    condition: "fair",
    status: requestedStatus,
  });
  const swap = await SwapRequest.create({
    requester,
    receiver: swapReceiver._id || swapReceiver,
    product_offered: offeredProduct._id,
    product_requested: requestedProduct._id,
    status,
    ...swapOverrides,
  });

  return { swap, offeredProduct, requestedProduct, receiver: swapReceiver };
};

describe("Admin API", () => {
  test("Admin should access dashboard stats", async () => {
    const offeredProduct = await Product.create({
      owner_id: normalUser._id,
      title: "Stats offered product",
      category: "Electronics",
      condition: "good",
      status: "available",
      is_featured: true,
    });
    const requestedProduct = await Product.create({
      owner_id: adminUser._id,
      title: "Stats requested product",
      category: "Books",
      condition: "fair",
      status: "reserved",
    });
    await Product.create({
      owner_id: normalUser._id,
      title: "Stats swapped product",
      category: "Home",
      condition: "used",
      status: "swapped",
    });
    const reviewSwap = await SwapRequest.create({
      requester: normalUser._id,
      receiver: adminUser._id,
      product_offered: offeredProduct._id,
      product_requested: requestedProduct._id,
      status: "under_review",
      exchange_method: "delivery",
      delivery_details: {
        delivery_status: "in_transit",
      },
    });
    await SwapRequest.create({
      requester: normalUser._id,
      receiver: adminUser._id,
      product_offered: offeredProduct._id,
      product_requested: requestedProduct._id,
      status: "completed",
    });
    await Report.create({
      reporter: normalUser._id,
      target_type: "product",
      target_id: offeredProduct._id,
      reason: "Misleading listing",
      status: "open",
    });
    await Report.create({
      reporter: normalUser._id,
      swap: reviewSwap._id,
      target_type: "swap",
      target_id: reviewSwap._id,
      reason: "Swap needs review",
      status: "under_review",
    });
    await ContactMessage.create({
      full_name: "Dashboard Reporter",
      email: "dashboard@example.com",
      inquiry_type: "general",
      subject: "Stats issue",
      message: "Please review this dashboard issue.",
      status: "open",
    });
    await ContactMessage.create({
      full_name: "Dashboard Billing",
      email: "billing@example.com",
      inquiry_type: "billing",
      subject: "Coins issue",
      message: "Please review this billing issue.",
      status: "in_review",
    });
    await Transaction.create([
      {
        user: normalUser._id,
        type: "signup_bonus",
        direction: "credit",
        amount: 50,
        currency: "coins",
        status: "completed",
        description: "Welcome signup bonus",
      },
      {
        user: normalUser._id,
        type: "feature_product",
        direction: "debit",
        amount: 5,
        currency: "coins",
        status: "completed",
        description: "Featured product",
      },
      {
        user: normalUser._id,
        type: "admin_adjustment",
        direction: "credit",
        amount: 7,
        currency: "coins",
        status: "completed",
        description: "Admin adjustment",
      },
    ]);

    const res = await request(app)
      .get("/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.total_users).toBeGreaterThanOrEqual(2);
    expect(res.body.product_statuses.available).toBeGreaterThanOrEqual(1);
    expect(res.body.product_statuses.reserved).toBeGreaterThanOrEqual(1);
    expect(res.body.product_statuses.swapped).toBeGreaterThanOrEqual(1);
    expect(res.body.category_counts.Electronics).toBeGreaterThanOrEqual(1);
    expect(res.body.category_counts.Books).toBeGreaterThanOrEqual(1);
    expect(res.body.category_counts.Home).toBeGreaterThanOrEqual(1);
    expect(res.body.category_breakdown.some((category) =>
      category.category === "Books" &&
      category.name === "Books" &&
      category.count >= 1
    )).toBe(true);
    expect(res.body.featured_products).toBeGreaterThanOrEqual(1);
    expect(res.body.reported_products).toBeGreaterThanOrEqual(1);
    expect(res.body.swap_statuses.under_review).toBeGreaterThanOrEqual(1);
    expect(res.body.swap_statuses.completed).toBeGreaterThanOrEqual(1);
    expect(res.body.pending_approvals).toBe(res.body.swap_statuses.under_review);
    expect(res.body.open_reports).toBeGreaterThanOrEqual(1);
    expect(res.body.in_review_reports).toBeGreaterThanOrEqual(1);
    expect(res.body.reports_needing_review).toBe(res.body.open_reports + res.body.in_review_reports);
    expect(res.body.open_contact_messages).toBeGreaterThanOrEqual(1);
    expect(res.body.in_review_contact_messages).toBeGreaterThanOrEqual(1);
    expect(res.body.support_messages_needing_review).toBe(res.body.open_contact_messages + res.body.in_review_contact_messages);
    expect(res.body.total_coin_transactions).toBeGreaterThanOrEqual(3);
    expect(res.body.total_coins_credited).toBeGreaterThanOrEqual(57);
    expect(res.body.total_coins_debited).toBeGreaterThanOrEqual(5);
    expect(res.body.admin_adjustments_count).toBeGreaterThanOrEqual(1);
    expect(res.body.delivery_statuses.in_transit).toBeGreaterThanOrEqual(1);
    expect(res.body.latest_swaps.length).toBeGreaterThan(0);
    expect(res.body.latest_reports.length).toBeGreaterThan(0);
    expect(res.body.latest_support_messages.length).toBeGreaterThan(0);
    expect(res.body.latest_transactions.length).toBeGreaterThan(0);
  });

  test("Normal user should NOT access admin stats", async () => {
    const res = await request(app)
      .get("/admin/stats")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.category_counts).toBeUndefined();
    expect(res.body.category_breakdown).toBeUndefined();
  });

  test("Admin category breakdown includes the full admin product scope", async () => {
    const category = `Admin Scope ${Date.now()}`;

    await Product.create([
      {
        owner_id: normalUser._id,
        title: "Admin scope available product",
        category,
        condition: "good",
        status: "available",
      },
      {
        owner_id: normalUser._id,
        title: "Admin scope reserved product",
        category,
        condition: "good",
        status: "reserved",
      },
      {
        owner_id: normalUser._id,
        title: "Admin scope swapped product",
        category,
        condition: "good",
        status: "swapped",
      },
      {
        owner_id: normalUser._id,
        title: "Admin scope inactive product",
        category,
        condition: "good",
        status: "inactive",
      },
      {
        owner_id: normalUser._id,
        title: "Admin scope rejected product",
        category,
        condition: "good",
        status: "rejected",
      },
    ]);

    const res = await request(app)
      .get("/admin/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.category_counts[category]).toBe(5);
    expect(res.body.category_breakdown).toContainEqual({
      category,
      name: category,
      count: 5,
    });
  });

  test("Admin should list coin transactions", async () => {
    await Transaction.create({
      user: normalUser._id,
      type: "signup_bonus",
      direction: "credit",
      amount: 50,
      currency: "coins",
      status: "completed",
      description: "Welcome signup bonus",
    });

    const res = await request(app)
      .get("/admin/transactions")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.transactions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.transactions.some((transaction) =>
      transaction.user.email === "user@test.com" &&
      transaction.type === "signup_bonus"
    )).toBe(true);
  });

  test("Normal user should NOT access admin transactions", async () => {
    const res = await request(app)
      .get("/admin/transactions")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.statusCode).toBe(403);
  });

  test("Admin approvals list under-review swaps and approval reserves products", async () => {
    const receiver = await User.create({
      first_name: "Review",
      last_name: "Receiver",
      email: `review-receiver-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: true,
    });
    const offeredProduct = await Product.create({
      owner_id: normalUser._id,
      title: "Approval offered product",
      category: "Electronics",
      condition: "good",
      status: "available",
    });
    const requestedProduct = await Product.create({
      owner_id: receiver._id,
      title: "Approval requested product",
      category: "Books",
      condition: "fair",
      status: "available",
    });
    const swap = await SwapRequest.create({
      requester: normalUser._id,
      receiver: receiver._id,
      product_offered: offeredProduct._id,
      product_requested: requestedProduct._id,
      status: "under_review",
      message: "Please review this swap",
    });

    const listRes = await request(app)
      .get("/admin/swaps?status=under_review")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.swaps.some((item) => String(item._id) === String(swap._id))).toBe(true);

    const res = await request(app)
      .patch(`/admin/swaps/${swap._id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ admin_notes: "Looks fair" });

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("approved");
    expect(res.body.swap.admin_notes).toBe("Looks fair");
    expect(res.body.swap.timeline.some((event) => event.event === "admin_approved")).toBe(true);

    const updatedSwap = await SwapRequest.findById(swap._id);
    expect(updatedSwap.status).toBe("approved");
    expect(String(updatedSwap.admin_reviewed_by)).toBe(String(adminUser._id));
    expect(updatedSwap.admin_reviewed_at).toBeTruthy();

    const products = await Product.find({ _id: { $in: [offeredProduct._id, requestedProduct._id] } });
    expect(products.map((product) => product.status).sort()).toEqual(["reserved", "reserved"]);

    const approvalTimeline = await SwapTimelineEvent.findOne({
      swap: swap._id,
      event: "admin_approved",
    });
    expect(approvalTimeline).toBeTruthy();
    expect(approvalTimeline.description).toContain("Looks fair");

    const notifications = await Notification.find({
      related_swap: swap._id,
      type: "swap-approved",
    });
    expect(notifications).toHaveLength(2);
    expect(notifications.every((notification) => notification.target_url === `/user/swaps/${swap._id}`)).toBe(true);

    const userSwapRes = await request(app)
      .get(`/swaps/${swap._id}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(userSwapRes.statusCode).toBe(200);
    expect(userSwapRes.body.swap.admin_notes).toBeUndefined();
    expect(userSwapRes.body.swap.admin_reviewed_by).toBeUndefined();
    expect(JSON.stringify(userSwapRes.body.swap)).not.toContain("Looks fair");
  });

  test("Admin rejection releases products, refunds held compensation, notifies users, and writes timeline", async () => {
    const payer = await User.create({
      first_name: "Compensation",
      last_name: "Payer",
      email: `compensation-payer-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      coins: 5,
      held_coins: 15,
    });
    const receiver = await User.create({
      first_name: "Compensation",
      last_name: "Receiver",
      email: `compensation-receiver-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
    });
    const offeredProduct = await Product.create({
      owner_id: payer._id,
      title: "Rejected offered product",
      category: "Home",
      condition: "good",
      status: "reserved",
    });
    const requestedProduct = await Product.create({
      owner_id: receiver._id,
      title: "Rejected requested product",
      category: "Books",
      condition: "fair",
      status: "reserved",
    });
    const swap = await SwapRequest.create({
      requester: payer._id,
      receiver: receiver._id,
      product_offered: offeredProduct._id,
      product_requested: requestedProduct._id,
      status: "under_review",
      message: "Please reject this swap",
      compensation_amount: 15,
      compensation_payer: payer._id,
      compensation_receiver: receiver._id,
      compensation_status: "held",
    });

    const res = await request(app)
      .patch(`/admin/swaps/${swap._id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ admin_notes: "Values are too far apart" });

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("rejected");
    expect(res.body.swap.admin_notes).toBe("Values are too far apart");
    expect(res.body.swap.timeline.some((event) => event.event === "admin_rejected")).toBe(true);
    expect(res.body.swap.timeline.some((event) => event.event === "compensation_refunded")).toBe(true);

    const updatedSwap = await SwapRequest.findById(swap._id);
    expect(updatedSwap.status).toBe("rejected");
    expect(updatedSwap.compensation_status).toBe("refunded");

    const products = await Product.find({ _id: { $in: [offeredProduct._id, requestedProduct._id] } });
    expect(products.map((product) => product.status).sort()).toEqual(["available", "available"]);

    const updatedPayer = await User.findById(payer._id);
    expect(updatedPayer.coins).toBe(20);
    expect(updatedPayer.held_coins).toBe(0);

    const refundTransaction = await Transaction.findOne({
      user: payer._id,
      swap: swap._id,
      type: "coin_refund",
      direction: "refund",
      amount: 15,
    });
    expect(refundTransaction).toBeTruthy();

    const notifications = await Notification.find({
      related_swap: swap._id,
      type: "swap-rejected",
    });
    expect(notifications).toHaveLength(2);
    expect(notifications.every((notification) => notification.target_url === `/user/swaps/${swap._id}`)).toBe(true);
  });

  test("Admin can cancel an active swap with reason, release products, and expire pending service fees", async () => {
    const { swap, offeredProduct, requestedProduct } = await createAdminCancellationSwap({
      status: "payment_pending",
      swapOverrides: {
        requester_paid: true,
        receiver_paid: false,
      },
    });
    const pendingTransaction = await Transaction.create({
      user: swap.receiver,
      swap: swap._id,
      type: "service_fee",
      direction: "debit",
      amount: 15,
      currency: "EGP",
      status: "pending",
      description: "Pending receiver service fee",
      metadata: {
        provider: "paymob",
        purpose: "service_fee",
        serviceFeeSide: "receiver",
      },
    });
    const completedTransaction = await Transaction.create({
      user: swap.requester,
      swap: swap._id,
      type: "service_fee",
      direction: "debit",
      amount: 15,
      currency: "EGP",
      status: "completed",
      description: "Completed requester service fee",
      metadata: {
        provider: "paymob",
        purpose: "service_fee",
        serviceFeeSide: "requester",
      },
    });

    const res = await request(app)
      .patch(`/admin/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ admin_notes: "Participants abandoned checkout." });

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("cancelled");
    expect(res.body.swap.admin_notes).toBe("Participants abandoned checkout.");
    expect(res.body.service_fee_review_required).toBe(true);
    expect(res.body.completed_service_fee_transactions).toBe(1);
    expect(res.body.expired_service_fee_transactions).toBe(1);
    expect(res.body.swap.timeline.some((event) => event.event === "cancelled")).toBe(true);

    const [updatedSwap, offeredAfter, requestedAfter, expiredPending, unchangedCompleted] = await Promise.all([
      SwapRequest.findById(swap._id),
      Product.findById(offeredProduct._id),
      Product.findById(requestedProduct._id),
      Transaction.findById(pendingTransaction._id),
      Transaction.findById(completedTransaction._id),
    ]);

    expect(updatedSwap.status).toBe("cancelled");
    expect(String(updatedSwap.admin_reviewed_by)).toBe(String(adminUser._id));
    expect(updatedSwap.admin_reviewed_at).toBeTruthy();
    expect(offeredAfter.status).toBe("available");
    expect(requestedAfter.status).toBe("available");
    expect(expiredPending.status).toBe("expired");
    expect(expiredPending.metadata.serviceFeeExpiredByActor).toBe("admin");
    expect(unchangedCompleted.status).toBe("completed");

    const notifications = await Notification.find({
      related_swap: swap._id,
      title: "Swap cancelled",
    });
    expect(notifications).toHaveLength(2);
  });

  test("Admin cancel requires admin access and reason", async () => {
    const { swap } = await createAdminCancellationSwap();

    const normalUserRes = await request(app)
      .patch(`/admin/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ admin_notes: "Not allowed" });

    expect(normalUserRes.statusCode).toBe(403);

    const missingReasonRes = await request(app)
      .patch(`/admin/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    expect(missingReasonRes.statusCode).toBe(400);
    expect(missingReasonRes.body.message).toMatch(/reason/i);

    const unchangedSwap = await SwapRequest.findById(swap._id);
    expect(unchangedSwap.status).toBe("approved");
  });

  test.each(["completed", "cancelled", "rejected"])(
    "Admin cannot cancel a %s swap",
    async (status) => {
      const { swap } = await createAdminCancellationSwap({
        status,
        offeredStatus: status === "completed" ? "swapped" : "reserved",
        requestedStatus: status === "completed" ? "swapped" : "reserved",
      });

      const res = await request(app)
        .patch(`/admin/swaps/${swap._id}/cancel`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ admin_notes: "Terminal swap should not cancel" });

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/active non-terminal/i);
    }
  );

  test("Admin cancellation leaves a shared reserved product locked by another active swap", async () => {
    const { swap, offeredProduct, requestedProduct } = await createAdminCancellationSwap({
      status: "approved",
    });
    const otherRequestedProduct = await Product.create({
      owner_id: swap.receiver,
      title: `Admin shared requested ${Date.now()}-${Math.random()}`,
      category: "Books",
      condition: "good",
      status: "reserved",
    });
    await SwapRequest.create({
      requester: swap.requester,
      receiver: swap.receiver,
      product_offered: offeredProduct._id,
      product_requested: otherRequestedProduct._id,
      status: "exchange_setup",
      requester_paid: true,
      receiver_paid: true,
    });

    const res = await request(app)
      .patch(`/admin/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ admin_notes: "Cancel one duplicate active swap only." });

    expect(res.statusCode).toBe(200);

    const [sharedProduct, releasedProduct] = await Promise.all([
      Product.findById(offeredProduct._id),
      Product.findById(requestedProduct._id),
    ]);
    expect(sharedProduct.status).toBe("reserved");
    expect(releasedProduct.status).toBe("available");
  });

  test("Admin swaps list and detail expose real filters, reports, messages, and timeline", async () => {
    const receiver = await User.create({
      first_name: "Filtered",
      last_name: "Receiver",
      email: `filtered-receiver-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: true,
    });
    const offeredProduct = await Product.create({
      owner_id: normalUser._id,
      title: "Filtered offered camera",
      category: "Electronics",
      condition: "good",
      status: "reserved",
    });
    const requestedProduct = await Product.create({
      owner_id: receiver._id,
      title: "Filtered requested lens",
      category: "Photography",
      condition: "like-new",
      status: "reserved",
    });
    const swap = await SwapRequest.create({
      requester: normalUser._id,
      receiver: receiver._id,
      product_offered: offeredProduct._id,
      product_requested: requestedProduct._id,
      status: "in_progress",
      message: "Delivery swap under moderation",
      exchange_method: "delivery",
      requester_paid: true,
      receiver_paid: false,
      compensation_amount: 12,
      compensation_payer: normalUser._id,
      compensation_receiver: receiver._id,
      compensation_status: "held",
      delivery_details: {
        delivery_status: "pending_pickup",
      },
    });
    await Message.create({
      swap: swap._id,
      sender: normalUser._id,
      content: "Please keep the discussion visible to admins.",
      is_reported: true,
      report_reason: "Contains suspicious wording",
    });
    await SwapTimelineEvent.create({
      swap: swap._id,
      event: "delivery_created",
      description: "Delivery flow created for test.",
      actor: "system",
    });
    await Report.create({
      reporter: receiver._id,
      swap: swap._id,
      target_type: "swap",
      target_id: swap._id,
      reason: "Delivery concern",
      description: "The delivery details need admin review.",
      status: "open",
    });

    const listRes = await request(app)
      .get("/admin/swaps?status=in_progress&exchange_method=delivery&q=filtered")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.total).toBeGreaterThanOrEqual(1);

    const listedSwap = listRes.body.swaps.find((item) => String(item._id) === String(swap._id));
    expect(listedSwap).toBeTruthy();
    expect(listedSwap.exchange_method).toBe("delivery");
    expect(listedSwap.compensation_status).toBe("held");
    expect(listedSwap.report_count).toBe(1);
    expect(listedSwap.open_report_count).toBe(1);

    const detailRes = await request(app)
      .get(`/admin/swaps/${swap._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.body.swap._id).toBe(String(swap._id));
    expect(detailRes.body.swap.timeline.some((event) => event.event === "delivery_created")).toBe(true);
    expect(detailRes.body.swap.report_count).toBe(1);
    expect(detailRes.body.reports).toHaveLength(1);
    expect(detailRes.body.reports[0].reason).toBe("Delivery concern");

    const messagesRes = await request(app)
      .get(`/admin/swaps/${swap._id}/messages`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(messagesRes.statusCode).toBe(200);
    expect(messagesRes.body.messages).toHaveLength(1);
    expect(messagesRes.body.messages[0].content).toBe("Please keep the discussion visible to admins.");
    expect(messagesRes.body.messages[0].is_reported).toBe(true);
  });

  test("Admin reports list supports filters and non-swap reports resolve safely", async () => {
    const product = await Product.create({
      owner_id: normalUser._id,
      title: "Counterfeit collectible report target",
      category: "Collectibles",
      condition: "good",
      status: "available",
    });
    const productReport = await Report.create({
      reporter: adminUser._id,
      target_type: "product",
      target_id: product._id,
      reason: "Counterfeit listing",
      description: "The product photos appear copied.",
      status: "open",
    });

    const listRes = await request(app)
      .get("/admin/reports?target_type=product&status=open&q=counterfeit")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.total).toBeGreaterThanOrEqual(1);

    const listedReport = listRes.body.reports.find((report) => report.id === String(productReport._id));
    expect(listedReport).toBeTruthy();
    expect(listedReport.target.type).toBe("product");
    expect(listedReport.target.label).toBe("Counterfeit collectible report target");
    expect(listedReport.target.url).toBe("/admin/products?reported=true");

    const invalidSwapAction = await request(app)
      .patch(`/admin/reports/${productReport._id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        resolution_action: "cancel_swap",
        admin_notes: "This should not be allowed.",
      });

    expect(invalidSwapAction.statusCode).toBe(400);
    expect(invalidSwapAction.body.message).toBe("Swap lifecycle actions are only valid for swap disputes");

    const missingNotes = await request(app)
      .patch(`/admin/reports/${productReport._id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ resolution_action: "resolve" });

    expect(missingNotes.statusCode).toBe(400);
    expect(missingNotes.body.message).toBe("Admin notes are required for this resolution action");

    const resolveRes = await request(app)
      .patch(`/admin/reports/${productReport._id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        resolution_action: "resolve",
        admin_notes: "Handled through product moderation.",
      });

    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.body.report.status).toBe("resolved");
    expect(resolveRes.body.report.resolution_action).toBe("resolve");
    expect(resolveRes.body.report.admin_notes).toBe("Handled through product moderation.");
    expect(resolveRes.body.report.resolved_by.email).toBe("admin@test.com");

    const doubleResolve = await request(app)
      .patch(`/admin/reports/${productReport._id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        resolution_action: "dismiss",
      });

    expect(doubleResolve.statusCode).toBe(400);
    expect(doubleResolve.body.message).toBe("Report has already been resolved");
  });

  test("Admin reports include reported message context without fake actions", async () => {
    const receiver = await User.create({
      first_name: "Message",
      last_name: "Receiver",
      email: `message-receiver-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
    });
    const offeredProduct = await Product.create({
      owner_id: normalUser._id,
      title: "Message report offered item",
      category: "Electronics",
      condition: "good",
      status: "reserved",
    });
    const requestedProduct = await Product.create({
      owner_id: receiver._id,
      title: "Message report requested item",
      category: "Books",
      condition: "fair",
      status: "reserved",
    });
    const swap = await SwapRequest.create({
      requester: normalUser._id,
      receiver: receiver._id,
      product_offered: offeredProduct._id,
      product_requested: requestedProduct._id,
      status: "in_discussion",
    });
    const message = await Message.create({
      swap: swap._id,
      sender: receiver._id,
      content: "Reported message context for admins",
      is_reported: true,
      report_reason: "Harassment",
    });
    const messageReport = await Report.create({
      reporter: normalUser._id,
      swap: swap._id,
      target_type: "message",
      target_id: message._id,
      reason: "Harassment",
      description: "Message was inappropriate.",
      status: "open",
    });

    const res = await request(app)
      .get("/admin/reports?target_type=message&q=context")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);

    const listedReport = res.body.reports.find((report) => report.id === String(messageReport._id));
    expect(listedReport).toBeTruthy();
    expect(listedReport.target.type).toBe("message");
    expect(listedReport.target.label).toBe("Reported message context for admins");
    expect(listedReport.target.url).toBe(`/admin/swaps/${swap._id}`);
    expect(listedReport.related_swap_id).toBe(String(swap._id));
    expect(listedReport.current_swap_status).toBe("in_discussion");
    expect(listedReport.target.message.report_reason).toBe("Harassment");
    expect(listedReport.target.message.sender.email).toBe(receiver.email);
    expect(listedReport.target.message.sender.role).toBe("user");
  });

  test("Admin should list users with real moderation data", async () => {
    const reportedUser = await User.create({
      first_name: "Reported",
      last_name: "Member",
      email: `reported-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: true,
      isPhoneVerified: true,
      coins: 88,
      rating: 4.5,
      rating_count: 2,
    });

    await Report.create({
      reporter: normalUser._id,
      target_type: "user",
      target_id: reportedUser._id,
      reason: "Suspicious behavior",
      status: "open",
    });

    const res = await request(app)
      .get("/admin/users?reported=true&role=user&status=active")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);

    const listedUser = res.body.users.find((user) => user.id === String(reportedUser._id));
    expect(listedUser).toBeTruthy();
    expect(listedUser.email).toBe(reportedUser.email);
    expect(listedUser.role).toBe("user");
    expect(listedUser.coins).toBe(88);
    expect(listedUser.rating).toBe(4.5);
    expect(listedUser.report_count).toBe(1);
    expect(typeof listedUser.trust_score).toBe("number");
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.summary.reported).toBeGreaterThanOrEqual(1);
  });

  test("Admin users excludes admin accounts from normal user management", async () => {
    const res = await request(app)
      .get("/admin/users?status=all")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.users.some((user) => user.id === String(adminUser._id))).toBe(false);
    expect(res.body.users.every((user) => user.role === "user")).toBe(true);
    expect(res.body.summary.total).toBe(res.body.total);

    const adminRoleRes = await request(app)
      .get("/admin/users?role=admin")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminRoleRes.statusCode).toBe(400);
    expect(adminRoleRes.body.message).toMatch(/normal user management/i);

    const explicitAdminRes = await request(app)
      .get("/admin/users?includeAdmins=true&role=admin&status=active")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(explicitAdminRes.statusCode).toBe(200);
    const listedAdmin = explicitAdminRes.body.users.find((user) => user.id === String(adminUser._id));
    expect(listedAdmin).toBeTruthy();
    expect(listedAdmin.trust_level).toBe("admin");
    expect(listedAdmin.trust_score).toBeNull();
  });

  test("Admin users marks unverified accounts as pending verification, not active", async () => {
    const pendingUser = await User.create({
      first_name: "Pending",
      last_name: "Verification",
      email: `pending-verification-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: false,
      isPhoneVerified: false,
    });

    const allRes = await request(app)
      .get("/admin/users?status=all")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(allRes.statusCode).toBe(200);
    const listedPending = allRes.body.users.find((user) => user.id === String(pendingUser._id));
    expect(listedPending).toBeTruthy();
    expect(listedPending.isEmailVerified).toBe(false);
    expect(listedPending.isPhoneVerified).toBe(false);
    expect(listedPending.account_status).toBe("pending_verification");
    expect(allRes.body.summary.unverified).toBeGreaterThanOrEqual(1);

    const activeRes = await request(app)
      .get("/admin/users?status=active")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(activeRes.statusCode).toBe(200);
    expect(activeRes.body.users.some((user) => user.id === String(pendingUser._id))).toBe(false);
    expect(activeRes.body.summary.active).toBe(activeRes.body.total);

    const pendingRes = await request(app)
      .get("/admin/users?status=pending_verification")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(pendingRes.statusCode).toBe(200);
    expect(pendingRes.body.users.some((user) => user.id === String(pendingUser._id))).toBe(true);
    expect(pendingRes.body.users.every((user) => user.account_status === "pending_verification")).toBe(true);
  });

  test("Admin suspicious activity uses real stored signals only", async () => {
    const unique = Date.now();
    const password = await bcrypt.hash("123456", 10);
    const [reporterOne, reporterTwo, reporterThree, reporterFour, reportedUser, productOwner, disputeUser, disputePeer, adjustmentUser] = await User.create([
      {
        first_name: "Suspicious",
        last_name: "ReporterOne",
        email: `suspicious-reporter-one-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Suspicious",
        last_name: "ReporterTwo",
        email: `suspicious-reporter-two-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Suspicious",
        last_name: "ReporterThree",
        email: `suspicious-reporter-three-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Suspicious",
        last_name: "ReporterFour",
        email: `suspicious-reporter-four-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Reported",
        last_name: "User",
        email: `reported-user-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Reported",
        last_name: "ProductOwner",
        email: `reported-product-owner-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Dispute",
        last_name: "User",
        email: `dispute-user-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Dispute",
        last_name: "Peer",
        email: `dispute-peer-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
      {
        first_name: "Adjustment",
        last_name: "User",
        email: `adjustment-user-${unique}@test.com`,
        password,
        isEmailVerified: true,
      },
    ]);
    const reportedProduct = await Product.create({
      owner_id: productOwner._id,
      title: `Reported Product ${unique}`,
      category: "Electronics",
      condition: "good",
      status: "available",
    });

    await Report.create([
      {
        reporter: reporterOne._id,
        target_type: "user",
        target_id: reportedUser._id,
        reason: "Repeated user issue",
      },
      {
        reporter: reporterTwo._id,
        target_type: "user",
        target_id: reportedUser._id,
        reason: "Second user issue",
      },
      {
        reporter: reporterThree._id,
        target_type: "product",
        target_id: reportedProduct._id,
        reason: "Repeated product issue",
      },
      {
        reporter: reporterFour._id,
        target_type: "product",
        target_id: reportedProduct._id,
        reason: "Second product issue",
      },
    ]);

    const disputeProducts = await Product.create([
      {
        owner_id: disputeUser._id,
        title: `Dispute offered A ${unique}`,
        category: "Books",
        condition: "good",
      },
      {
        owner_id: disputePeer._id,
        title: `Dispute requested A ${unique}`,
        category: "Books",
        condition: "good",
      },
      {
        owner_id: disputeUser._id,
        title: `Dispute offered B ${unique}`,
        category: "Books",
        condition: "good",
      },
      {
        owner_id: disputePeer._id,
        title: `Dispute requested B ${unique}`,
        category: "Books",
        condition: "good",
      },
    ]);
    const disputedSwaps = await SwapRequest.create([
      {
        requester: disputeUser._id,
        receiver: disputePeer._id,
        product_offered: disputeProducts[0]._id,
        product_requested: disputeProducts[1]._id,
        status: "disputed",
      },
      {
        requester: disputeUser._id,
        receiver: disputePeer._id,
        product_offered: disputeProducts[2]._id,
        product_requested: disputeProducts[3]._id,
        status: "disputed",
      },
    ]);

    await Report.create([
      {
        reporter: disputeUser._id,
        swap: disputedSwaps[0]._id,
        target_type: "swap",
        target_id: disputedSwaps[0]._id,
        reason: "Swap dispute one",
      },
      {
        reporter: disputePeer._id,
        swap: disputedSwaps[1]._id,
        target_type: "swap",
        target_id: disputedSwaps[1]._id,
        reason: "Swap dispute two",
      },
    ]);

    await Transaction.create([
      {
        user: adjustmentUser._id,
        type: "admin_adjustment",
        direction: "adjustment",
        amount: 10,
        status: "completed",
        description: "Suspicious adjustment one",
      },
      {
        user: adjustmentUser._id,
        type: "admin_adjustment",
        direction: "adjustment",
        amount: 20,
        status: "completed",
        description: "Suspicious adjustment two",
      },
      {
        user: adjustmentUser._id,
        type: "admin_adjustment",
        direction: "adjustment",
        amount: 30,
        status: "completed",
        description: "Suspicious adjustment three",
      },
    ]);

    const res = await request(app)
      .get("/admin/suspicious-activity")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.detection_rules.blocked_account_attempts).toMatch(/Not tracked/);
    expect(res.body.detection_rules.failed_payment_attempts).toMatch(/Not tracked/);
    expect(res.body.activities.find((activity) =>
      activity.source === "user_reports" &&
      activity.target_id === String(reportedUser._id)
    )).toBeTruthy();
    expect(res.body.activities.find((activity) =>
      activity.source === "product_reports" &&
      activity.target_id === String(reportedProduct._id) &&
      activity.target_product.title === reportedProduct.title
    )).toBeTruthy();
    expect(res.body.activities.find((activity) =>
      activity.source === "excessive_disputes" &&
      activity.target_id === String(disputeUser._id)
    )).toBeTruthy();
    expect(res.body.activities.find((activity) =>
      activity.source === "coin_adjustments" &&
      activity.target_id === String(adjustmentUser._id)
    )).toBeTruthy();

    const filteredRes = await request(app)
      .get(`/admin/suspicious-activity?source=product_reports&q=${encodeURIComponent(reportedProduct.title)}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(filteredRes.statusCode).toBe(200);
    expect(filteredRes.body.activities.length).toBe(1);
    expect(filteredRes.body.activities[0].source).toBe("product_reports");
    expect(filteredRes.body.activities[0].target_id).toBe(String(reportedProduct._id));
  });

  test("Admin can remove a non-admin user from platform and block the email identity", async () => {
    const userToDelete = await User.create({
      first_name: "Delete",
      last_name: "Me",
      email: `delete-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: true,
    });
    const ownedProduct = await Product.create({
      owner_id: userToDelete._id,
      title: "User owned product",
      category: "Home",
      condition: "good",
      status: "available",
      is_featured: true,
    });
    await User.updateOne(
      { _id: normalUser._id },
      { $addToSet: { saved_products: ownedProduct._id } }
    );

    const originalEmail = userToDelete.email;
    const reason = "Repeated policy violations";

    const res = await request(app)
      .delete(`/admin/users/${userToDelete._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.is_deleted).toBe(true);
    expect(res.body.user.account_status).toBe("deleted");

    const deletedUser = await User.findById(userToDelete._id);
    expect(deletedUser.is_deleted).toBe(true);
    expect(deletedUser.email).toContain("deleted-");

    const block = await BlockedAccount.findOne({ email_hash: hashBlockedEmail(originalEmail) });
    expect(block).toBeTruthy();
    expect(block.reason).toBe(reason);
    expect(String(block.blocked_by)).toBe(String(adminUser._id));
    expect(block.blocked_at).toBeInstanceOf(Date);

    const blockedLogin = await request(app)
      .post("/auth/login")
      .send({ email: originalEmail.toUpperCase(), password: "123456" });

    expect(blockedLogin.statusCode).toBe(403);
    expect(blockedLogin.body.message).toBe(BLOCKED_ACCOUNT_MESSAGE);

    const blockedRegister = await request(app)
      .post("/auth/register")
      .send({
        first_name: "Blocked",
        last_name: "Again",
        email: originalEmail,
        password: "Password1!",
      });

    expect(blockedRegister.statusCode).toBe(403);
    expect(blockedRegister.body.message).toBe(BLOCKED_ACCOUNT_MESSAGE);

    const updatedProduct = await Product.findById(ownedProduct._id);
    expect(updatedProduct.status).toBe("inactive");
    expect(updatedProduct.is_featured).toBe(false);

    const userWhoSaved = await User.findById(normalUser._id);
    expect(userWhoSaved.saved_products.map(String)).not.toContain(String(ownedProduct._id));
  });

  test("Admin removal protects self and other admin accounts", async () => {
    const otherAdmin = await User.create({
      first_name: "Second",
      last_name: "Admin",
      email: `second-admin-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      role: "admin",
      isEmailVerified: true,
    });

    const selfRes = await request(app)
      .delete(`/admin/users/${adminUser._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Unsafe self removal" });

    expect(selfRes.statusCode).toBe(400);
    expect(selfRes.body.message).toMatch(/own account/i);

    const otherAdminRes = await request(app)
      .delete(`/admin/users/${otherAdmin._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "Unsafe admin removal" });

    expect(otherAdminRes.statusCode).toBe(400);
    expect(otherAdminRes.body.message).toMatch(/Admin accounts/i);
  });

  test("Admin should list products with real owner and report data", async () => {
    const productOwner = await User.create({
      first_name: "Product",
      last_name: "Owner",
      email: `product-owner-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      isEmailVerified: true,
    });
    const reportedProduct = await Product.create({
      owner_id: productOwner._id,
      title: "Reported admin product",
      category: "Collectibles",
      condition: "like-new",
      estimated_value: 1200,
      status: "available",
      view_count: 12,
      saved_count: 3,
    });

    await Report.create({
      reporter: normalUser._id,
      target_type: "product",
      target_id: reportedProduct._id,
      reason: "Counterfeit item",
      status: "under_review",
    });

    const res = await request(app)
      .get("/admin/products?reported=true&category=Collectibles&status=available")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);

    const listedProduct = res.body.products.find((product) => product.id === String(reportedProduct._id));
    expect(listedProduct).toBeTruthy();
    expect(listedProduct.title).toBe("Reported admin product");
    expect(listedProduct.owner.name).toBe("Product Owner");
    expect(listedProduct.estimated_value).toBe(1200);
    expect(listedProduct.view_count).toBe(12);
    expect(listedProduct.saved_count).toBe(3);
    expect(listedProduct.report_count).toBe(1);
    expect(res.body.categories).toContain("Collectibles");
  });

  test("Admin can feature, hide, restore, and reject eligible products", async () => {
    const product = await Product.create({
      owner_id: normalUser._id,
      title: "Moderated product",
      category: "Electronics",
      condition: "good",
      status: "available",
    });

    const featureRes = await request(app)
      .patch(`/admin/products/${product._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_featured: true });

    expect(featureRes.statusCode).toBe(200);
    expect(featureRes.body.product.is_featured).toBe(true);

    const unfeatureRes = await request(app)
      .patch(`/admin/products/${product._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_featured: false });

    expect(unfeatureRes.statusCode).toBe(200);
    expect(unfeatureRes.body.product.is_featured).toBe(false);

    const hideRes = await request(app)
      .patch(`/admin/products/${product._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "inactive" });

    expect(hideRes.statusCode).toBe(200);
    expect(hideRes.body.product.status).toBe("inactive");

    const restoreRes = await request(app)
      .patch(`/admin/products/${product._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "available" });

    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.body.product.status).toBe("available");

    const rejectRes = await request(app)
      .patch(`/admin/products/${product._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "rejected" });

    expect(rejectRes.statusCode).toBe(200);
    expect(rejectRes.body.product.status).toBe("rejected");
  });

  test("Admin product moderation does not alter reserved or swapped lifecycle states", async () => {
    const reservedProduct = await Product.create({
      owner_id: normalUser._id,
      title: "Reserved product",
      category: "Electronics",
      condition: "good",
      status: "reserved",
    });

    const res = await request(app)
      .patch(`/admin/products/${reservedProduct._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "inactive" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Reserved or swapped products cannot be moderated from this page");

    const unchangedProduct = await Product.findById(reservedProduct._id);
    expect(unchangedProduct.status).toBe("reserved");
  });

  test("Contact form stores guest and logged-in messages for admin review", async () => {
    const guestRes = await request(app)
      .post("/contact")
      .send({
        fullName: "Guest Sender",
        email: "guest@example.com",
        inquiryType: "general",
        subject: "Question about swaps",
        message: "Can I ask about an item before submitting a swap?",
      });

    expect(guestRes.statusCode).toBe(201);
    expect(guestRes.body.contact_message.user_id).toBeUndefined();

    const userRes = await request(app)
      .post("/contact")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        full_name: "Normal User",
        email: "user@test.com",
        inquiry_type: "technical",
        subject: "Dashboard issue",
        message: "My dashboard does not refresh.",
      });

    expect(userRes.statusCode).toBe(201);

    const saved = await ContactMessage.findById(userRes.body.contact_message._id);
    expect(String(saved.user_id)).toBe(String(normalUser._id));
    expect(saved.status).toBe("open");

    const adminList = await request(app)
      .get("/admin/contact-messages?status=open&inquiry_type=technical")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(adminList.statusCode).toBe(200);
    expect(adminList.body.count).toBe(1);
    expect(adminList.body.messages[0].subject).toBe("Dashboard issue");
    expect(adminList.body.messages[0].user_id.email).toBe("user@test.com");
  });

  test("Admin can update contact message status and notes", async () => {
    const contactMessage = await ContactMessage.create({
      full_name: "Support User",
      email: "support-user@example.com",
      inquiry_type: "billing",
      subject: "Coins question",
      message: "Please review my coin balance.",
    });

    const res = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "in_review",
        admin_notes: "Checking wallet ledger.",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.contact_message.status).toBe("in_review");
    expect(res.body.contact_message.admin_notes).toBe("Checking wallet ledger.");

    const updated = await ContactMessage.findById(contactMessage._id);
    expect(updated.status).toBe("in_review");
    expect(updated.admin_notes).toBe("Checking wallet ledger.");
  });

  test("Admin notes remain internal and do not notify or email the user", async () => {
    const contactMessage = await ContactMessage.create({
      full_name: "Linked Support User",
      email: "linked-support-user@example.com",
      inquiry_type: "technical",
      subject: "Private diagnostics",
      message: "Please review my issue.",
      user_id: normalUser._id,
    });

    const res = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        admin_notes: "Internal-only investigation notes.",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.contact_message.admin_notes).toBe("Internal-only investigation notes.");
    expect(res.body.contact_message.user_reply).toBe("");
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();

    const notification = await Notification.findOne({
      user: normalUser._id,
      target_type: "support",
      target_id: contactMessage._id,
    });
    expect(notification).toBeNull();

    const updated = await ContactMessage.findById(contactMessage._id);
    expect(updated.admin_notes).toBe("Internal-only investigation notes.");
    expect(updated.user_reply).toBe("");
    expect(updated.replied_at).toBeUndefined();
  });

  test("Admin resolve with user reply stores reply separately, notifies linked user, and sends email", async () => {
    const contactMessage = await ContactMessage.create({
      full_name: "Reply Recipient",
      email: "reply-recipient@example.com",
      inquiry_type: "billing",
      subject: "Coin balance question",
      message: "My coin balance looks wrong.",
      user_id: normalUser._id,
    });

    const res = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "resolved",
        admin_notes: "Internal ledger note that must stay private.",
        user_reply: "Thanks for waiting. Your coin balance has been corrected.",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.contact_message.status).toBe("resolved");
    expect(res.body.contact_message.admin_notes).toBe("Internal ledger note that must stay private.");
    expect(res.body.contact_message.user_reply).toBe("Thanks for waiting. Your coin balance has been corrected.");
    expect(res.body.reply_delivery).toEqual(
      expect.objectContaining({
        notification_sent: true,
        email_sent: true,
        email_skipped: false,
      })
    );

    const updated = await ContactMessage.findById(contactMessage._id);
    expect(updated.user_reply).toBe("Thanks for waiting. Your coin balance has been corrected.");
    expect(String(updated.replied_by)).toBe(String(adminUser._id));
    expect(updated.replied_at).toBeInstanceOf(Date);
    expect(String(updated.resolved_by)).toBe(String(adminUser._id));
    expect(updated.resolved_at).toBeInstanceOf(Date);

    const notification = await Notification.findOne({
      user: normalUser._id,
      target_type: "support",
      target_id: contactMessage._id,
    });
    expect(notification).toBeTruthy();
    expect(notification.title).toBe("Support request updated");
    expect(notification.body).toContain("Coin balance question");
    expect(notification.body).not.toContain("Internal ledger note");
    expect(notification.target_url).toBe("/user/notifications");

    expect(sendSupportReplyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "reply-recipient@example.com",
        name: "Reply Recipient",
        ticketSubject: "Coin balance question",
        reply: "Thanks for waiting. Your coin balance has been corrected.",
      })
    );
    expect(JSON.stringify(sendSupportReplyEmail.mock.calls[0][0])).not.toContain("Internal ledger note");
  });

  test("Guest contact message can receive email reply without in-app notification", async () => {
    const contactMessage = await ContactMessage.create({
      full_name: "Guest Reply User",
      email: "guest-reply@example.com",
      inquiry_type: "general",
      subject: "Guest question",
      message: "I am not logged in.",
    });

    const res = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        status: "dismissed",
        user_reply: "Thanks for reaching out. We have closed this request.",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.contact_message.status).toBe("dismissed");
    expect(res.body.contact_message.user_reply).toBe("Thanks for reaching out. We have closed this request.");
    expect(res.body.reply_delivery).toEqual(
      expect.objectContaining({
        notification_sent: false,
        email_sent: true,
      })
    );

    expect(await Notification.findOne({ target_id: contactMessage._id })).toBeNull();
    expect(sendSupportReplyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guest-reply@example.com",
        reply: "Thanks for reaching out. We have closed this request.",
      })
    );
  });

  test("Support reply email failure returns warning without rolling back the saved reply", async () => {
    sendSupportReplyEmail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    const contactMessage = await ContactMessage.create({
      full_name: "Warning User",
      email: "warning-user@example.com",
      inquiry_type: "technical",
      subject: "Email warning",
      message: "Please test warning behavior.",
      user_id: normalUser._id,
    });

    const res = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_reply: "Your reply is saved even if email delivery fails.",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.contact_message.user_reply).toBe("Your reply is saved even if email delivery fails.");
    expect(res.body.reply_delivery.email_sent).toBe(false);
    expect(res.body.warnings).toContain("Support reply was saved, but the email could not be sent.");

    const updated = await ContactMessage.findById(contactMessage._id);
    expect(updated.user_reply).toBe("Your reply is saved even if email delivery fails.");
  });

  test("Support contact admin endpoint remains protected from normal users", async () => {
    const contactMessage = await ContactMessage.create({
      full_name: "Protected User",
      email: "protected-support@example.com",
      inquiry_type: "general",
      subject: "Protected endpoint",
      message: "Only admins can update this.",
    });

    const res = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        user_reply: "This should not be allowed.",
      });

    expect(res.statusCode).toBe(403);
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();

    const updated = await ContactMessage.findById(contactMessage._id);
    expect(updated.user_reply).toBe("");
  });

  test("Support user reply validates type and length", async () => {
    const contactMessage = await ContactMessage.create({
      full_name: "Validation User",
      email: "validation-support@example.com",
      inquiry_type: "general",
      subject: "Validation",
      message: "Please validate reply.",
    });

    const invalidTypeRes = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_reply: { text: "not a string" },
      });

    expect(invalidTypeRes.statusCode).toBe(400);
    expect(invalidTypeRes.body.message).toBe("user_reply must be a string");

    const overLimitRes = await request(app)
      .patch(`/admin/contact-messages/${contactMessage._id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        user_reply: "x".repeat(5001),
      });

    expect(overLimitRes.statusCode).toBe(400);
    expect(overLimitRes.body.message).toBe("user_reply cannot exceed 5000 characters");
    expect(sendSupportReplyEmail).not.toHaveBeenCalled();

    const updated = await ContactMessage.findById(contactMessage._id);
    expect(updated.user_reply).toBe("");
  });

  test("Admin coin credit updates wallet and writes ledger transaction", async () => {
    const res = await request(app)
      .post("/admin/transactions/adjust")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: String(normalUser._id),
        direction: "credit",
        amount: 20,
        reason: "Compensation for delivery delay",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction.type).toBe("admin_adjustment");
    expect(res.body.transaction.direction).toBe("credit");
    expect(res.body.transaction.description).toBe("Admin adjustment: Compensation for delivery delay");

    const updatedUser = await User.findById(normalUser._id);
    expect(updatedUser.coins).toBe(70);
    expect(updatedUser.total_coins_earned).toBe(20);

    const transaction = await Transaction.findOne({
      user: normalUser._id,
      type: "admin_adjustment",
      direction: "credit",
      amount: 20,
    });
    expect(transaction).toBeTruthy();
    expect(transaction.metadata.reason).toBe("Compensation for delivery delay");
  });

  test("Admin coin adjustment protects self and other admin accounts", async () => {
    const otherAdmin = await User.create({
      first_name: "Wallet",
      last_name: "Admin",
      email: `wallet-admin-${Date.now()}@test.com`,
      password: await bcrypt.hash("123456", 10),
      role: "admin",
      isEmailVerified: true,
    });

    const candidateRes = await request(app)
      .get(`/admin/transactions?user=${encodeURIComponent(adminUser.email)}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(candidateRes.statusCode).toBe(200);
    expect(candidateRes.body.users).toHaveLength(0);
    expect(candidateRes.body.transactions).toHaveLength(0);

    const selfRes = await request(app)
      .post("/admin/transactions/adjust")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: String(adminUser._id),
        direction: "credit",
        amount: 20,
        reason: "Self wallet adjustment",
      });

    expect(selfRes.statusCode).toBe(400);
    expect(selfRes.body.message).toMatch(/own coin balance/i);

    const otherAdminRes = await request(app)
      .post("/admin/transactions/adjust")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: String(otherAdmin._id),
        direction: "credit",
        amount: 20,
        reason: "Other admin adjustment",
      });

    expect(otherAdminRes.statusCode).toBe(400);
    expect(otherAdminRes.body.message).toMatch(/Admin accounts/i);
  });

  test("Admin coin debit cannot make balance negative", async () => {
    const res = await request(app)
      .post("/admin/transactions/adjust")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        userId: String(normalUser._id),
        direction: "debit",
        amount: 9999,
        reason: "Invalid negative balance",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Debit cannot make user balance negative");
  });
});
