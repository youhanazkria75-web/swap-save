process.env.JWT_SECRET = "test_jwt_secret";
process.env.PAYMOB_API_KEY = "test_paymob_api_key";
process.env.PAYMOB_INTEGRATION_ID = "123456";
process.env.PAYMOB_IFRAME_ID = "654321";
process.env.PAYMOB_HMAC_SECRET = "test_paymob_hmac_secret";
process.env.PAYMOB_CURRENCY = "EGP";
process.env.PAYMOB_WEBHOOK_URL = "https://api.example.com/payments/paymob/webhook";
process.env.PAYMOB_SUCCESS_URL = "https://app.example.com/user/coins/payment/success";
process.env.PAYMOB_FAILURE_URL = "https://app.example.com/user/coins/payment/failure";
process.env.PAYMENT_DEV_TOKEN = "test-payment-dev-token";

const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const Notification = require("../src/models/Notification");
const Product = require("../src/models/Product");
const SwapRequest = require("../src/models/SwapRequest");
const SwapTimelineEvent = require("../src/models/SwapTimelineEvent");
const Transaction = require("../src/models/Transaction");
const User = require("../src/models/User");
const {
  SERVICE_FEE_CURRENCY,
  SERVICE_FEE_EGP,
  SERVICE_FEE_POLICY,
  getSwapServiceFeeEGP,
} = require("../src/config/serviceFees");
const { createPaymobHmac } = require("../src/services/paymob.service");

let mongoServer;
let originalFetch;

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

const mockPaymobCheckout = ({ orderId = 987654, paymentToken = "payment-token" } = {}) => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce(jsonResponse({ token: "auth-token", profile: { id: 444 } }))
    .mockResolvedValueOnce(jsonResponse({ id: orderId }))
    .mockResolvedValueOnce(jsonResponse({ token: paymentToken }));
};

const createUserAndToken = async ({ coins = 20, role = "user" } = {}) => {
  const user = await User.create({
    first_name: "Payment",
    last_name: "User",
    email: `payment-${Date.now()}-${Math.random()}@test.com`,
    password: "hashed",
    isEmailVerified: true,
    role,
    coins,
    total_coins_earned: 0,
  });
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

  return { user, token };
};

const createPaymobPayload = ({
  orderId,
  transactionId = 555001,
  amountCents = 5000,
  currency = "EGP",
  success = true,
  pending = false,
  errorOccurred = false,
  orderShape = "object",
  merchantOrderId,
  txnResponseCode = "APPROVED",
} = {}) => {
  const obj = {
    amount_cents: amountCents,
    created_at: "2026-05-06T12:00:00.000000",
    currency,
    error_occured: errorOccurred,
    has_parent_transaction: false,
    id: transactionId,
    integration_id: Number(process.env.PAYMOB_INTEGRATION_ID),
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    owner: 444,
    pending,
    txn_response_code: txnResponseCode,
    source_data: {
      pan: "2346",
      sub_type: "MasterCard",
      type: "card",
    },
    success,
  };

  if (orderShape === "object") {
    obj.order = { id: orderId };

    if (merchantOrderId) {
      obj.order.merchant_order_id = merchantOrderId;
    }
  } else if (orderShape === "primitive") {
    obj.order = orderId;
  } else if (orderShape === "order_id") {
    obj.order_id = orderId;
  }

  return {
    type: "TRANSACTION",
    obj,
  };
};

const createPaymobReturnQuery = ({
  orderId,
  transactionId = 555001,
  amountCents = 5000,
  currency = "EGP",
  success = true,
  pending = false,
  errorOccurred = false,
  txnResponseCode = "APPROVED",
  merchantOrderId,
  integrationId = Number(process.env.PAYMOB_INTEGRATION_ID),
} = {}) => {
  const query = {
    amount_cents: String(amountCents),
    created_at: "2026-05-06T12:00:00.000000",
    currency,
    error_occured: String(errorOccurred),
    has_parent_transaction: "false",
    id: String(transactionId),
    integration_id: String(integrationId),
    is_3d_secure: "true",
    is_auth: "false",
    is_capture: "false",
    is_refunded: "false",
    is_standalone_payment: "true",
    is_voided: "false",
    order: String(orderId),
    owner: "444",
    pending: String(pending),
    "source_data.pan": "2346",
    "source_data.sub_type": "MasterCard",
    "source_data.type": "card",
    success: String(success),
    txn_response_code: txnResponseCode,
  };

  if (merchantOrderId) {
    query.merchant_order_id = merchantOrderId;
  }

  return {
    ...query,
    hmac: createPaymobHmac(query),
  };
};

const createPendingPaymobPackageTransaction = async ({
  user,
  orderId = "700001",
  merchantOrderId = "coinpkg_return_test",
  transactionId,
  amountCents = 5000,
} = {}) =>
  Transaction.create({
    user: user._id,
    type: "package_purchase_pending",
    direction: "credit",
    amount: 100,
    currency: "coins",
    status: "pending",
    description: "Pending purchase of 100 coins via Paymob",
    metadata: {
      packageId: "coins_100",
      priceEGP: 50,
      provider: "paymob",
      merchantOrderId,
      paymobOrderId: String(orderId),
      ...(transactionId ? { paymobTransactionId: String(transactionId) } : {}),
      paymobIntegrationId: Number(process.env.PAYMOB_INTEGRATION_ID),
      paymobAmountCents: amountCents,
      paymobCurrency: "EGP",
    },
  });

const createApprovedSwap = async ({ requester, receiver } = {}) => {
  const offeredProduct = await Product.create({
    owner_id: requester._id,
    title: "Service fee offered product",
    category: "Electronics",
    condition: "good",
    status: "reserved",
  });
  const requestedProduct = await Product.create({
    owner_id: receiver._id,
    title: "Service fee requested product",
    category: "Electronics",
    condition: "good",
    status: "reserved",
  });

  return SwapRequest.create({
    requester: requester._id,
    receiver: receiver._id,
    product_offered: offeredProduct._id,
    product_requested: requestedProduct._id,
    status: "approved",
    service_fee_requester: SERVICE_FEE_EGP,
    service_fee_receiver: SERVICE_FEE_EGP,
  });
};

const createPendingPaymobServiceFeeTransaction = async ({
  user,
  swap,
  side,
  orderId,
  transactionId,
  merchantOrderId,
  amountCents = SERVICE_FEE_EGP * 100,
} = {}) =>
  Transaction.create({
    user: user._id,
    swap: swap._id,
    type: "service_fee",
    direction: "debit",
    amount: SERVICE_FEE_EGP,
    currency: SERVICE_FEE_CURRENCY,
    status: "pending",
    description: `Pending ${side} service fee via Paymob`,
    metadata: {
      purpose: "service_fee",
      provider: "paymob",
      serviceFeeSide: side,
      serviceFeeEGP: SERVICE_FEE_EGP,
      merchantOrderId,
      paymobOrderId: String(orderId),
      ...(transactionId ? { paymobTransactionId: String(transactionId) } : {}),
      paymobIntegrationId: Number(process.env.PAYMOB_INTEGRATION_ID),
      paymobAmountCents: amountCents,
      paymobCurrency: "EGP",
    },
  });

beforeAll(async () => {
  originalFetch = global.fetch;
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  global.fetch = originalFetch;
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    Notification.deleteMany({}),
    Product.deleteMany({}),
    SwapRequest.deleteMany({}),
    SwapTimelineEvent.deleteMany({}),
    Transaction.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("Paymob coin package payments", () => {
  test("service fee config is a fixed per-participant EGP amount", () => {
    expect(SERVICE_FEE_EGP).toBe(15);
    expect(SERVICE_FEE_CURRENCY).toBe("EGP");
    expect(SERVICE_FEE_POLICY).toBe("fixed_per_participant");
    expect(getSwapServiceFeeEGP()).toBe(SERVICE_FEE_EGP);
  });

  test("lists backend-authoritative EGP coin packages", async () => {
    const { token } = await createUserAndToken();

    const res = await request(app)
      .get("/users/me/wallet/packages")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.packages).toEqual([
      { id: "coins_100", name: "Starter", coins: 100, priceEGP: 50, currency: "EGP", isPopular: false },
      { id: "coins_300", name: "Plus", coins: 300, priceEGP: 140, currency: "EGP", isPopular: true },
      { id: "coins_700", name: "Pro", coins: 700, priceEGP: 300, currency: "EGP", isPopular: false },
      { id: "coins_1500", name: "Elite", coins: 1500, priceEGP: 600, currency: "EGP", isPopular: false },
    ]);
  });

  test("checkout creates a pending transaction and does not credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 12 });
    mockPaymobCheckout({ orderId: 777001, paymentToken: "checkout-token" });

    const res = await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_100" });

    expect(res.statusCode).toBe(201);
    expect(res.body.checkoutUrl).toContain("/acceptance/iframes/654321");
    expect(res.body.checkoutUrl).toContain("payment_token=checkout-token");
    expect(res.body.paymentUrl).toContain("/acceptance/iframes/654321");
    expect(res.body.paymentUrl).toContain("payment_token=checkout-token");
    expect(res.body.iframeUrl).toContain("payment_token=checkout-token");
    expect(res.body.canContinue).toBe(true);
    expect(res.body.package).toMatchObject({
      id: "coins_100",
      coins: 100,
      priceEGP: 50,
      currency: "EGP",
    });

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(12);
    expect(updatedUser.total_coins_earned).toBe(0);

    const transaction = await Transaction.findOne({ user: user._id });
    expect(transaction).toBeTruthy();
    expect(transaction.type).toBe("package_purchase_pending");
    expect(transaction.status).toBe("pending");
    expect(transaction.amount).toBe(100);
    expect(transaction.metadata.packageId).toBe("coins_100");
    expect(transaction.metadata.priceEGP).toBe(50);
    expect(transaction.metadata.provider).toBe("paymob");
    expect(transaction.metadata.payment_type).toBe("coin_purchase");
    expect(transaction.metadata.transaction_id).toBe(String(transaction._id));
    expect(transaction.metadata.transactionId).toBe(String(transaction._id));
    expect(transaction.metadata.payer_user_id).toBe(String(user._id));
    expect(transaction.metadata.merchantOrderId).toBe(`coinpkg_${transaction._id}`);
    expect(transaction.metadata.merchant_order_id).toBe(`coinpkg_${transaction._id}`);
    expect(transaction.metadata.paymobOrderId).toBe("777001");
    expect(transaction.metadata.paymob_order_id).toBe("777001");
    expect(transaction.metadata.paymobPaymentUrl).toContain("payment_token=checkout-token");
    expect(transaction.metadata.paymobIframeUrl).toContain("payment_token=checkout-token");

    const walletRes = await request(app)
      .get("/users/me/wallet")
      .set("Authorization", `Bearer ${token}`);

    expect(walletRes.statusCode).toBe(200);
    expect(walletRes.body.wallet.coins).toBe(12);
    const pendingHistory = walletRes.body.wallet.transactions.find(
      (item) => item.type === "package_purchase_pending"
    );
    expect(pendingHistory).toMatchObject({
      amount: 100,
      currency: "coins",
      status: "pending",
      checkout_url: transaction.metadata.paymobPaymentUrl,
      payment_url: transaction.metadata.paymobPaymentUrl,
      iframe_url: transaction.metadata.paymobIframeUrl,
      can_continue: true,
    });

    const paymentKeyBody = JSON.parse(global.fetch.mock.calls[2][1].body);
    expect(paymentKeyBody.amount_cents).toBe(5000);
    expect(paymentKeyBody.currency).toBe("EGP");
    expect(paymentKeyBody.integration_id).toBe(123456);
    expect(paymentKeyBody.redirection_url).toBe(process.env.PAYMOB_SUCCESS_URL);
  });

  test("checkout rejects unknown packages before calling Paymob", async () => {
    const { token } = await createUserAndToken();
    global.fetch = jest.fn();

    const res = await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_999" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid coin package");
    expect(await Transaction.countDocuments()).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("pending coin package checkout for the same package is reused and not duplicated", async () => {
    const { user, token } = await createUserAndToken({ coins: 12 });
    mockPaymobCheckout({ orderId: 777002, paymentToken: "coins-300-token" });

    const firstRes = await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_300" });

    expect(firstRes.statusCode).toBe(201);
    const firstPaymentUrl = firstRes.body.paymentUrl;

    global.fetch = jest.fn();
    const secondRes = await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_300" });

    expect(secondRes.statusCode).toBe(200);
    expect(secondRes.body.message).toBe("Coin package checkout already pending");
    expect(secondRes.body.checkoutUrl).toBe(firstPaymentUrl);
    expect(secondRes.body.paymentUrl).toBe(firstPaymentUrl);
    expect(secondRes.body.iframeUrl).toBe(firstRes.body.iframeUrl);
    expect(secondRes.body.canContinue).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      await Transaction.countDocuments({
        user: user._id,
        type: "package_purchase_pending",
        "metadata.packageId": "coins_300",
      })
    ).toBe(1);

    const unchangedUser = await User.findById(user._id);
    expect(unchangedUser.coins).toBe(12);
  });

  test("pending coin package checkout without a usable URL is expired and replaced", async () => {
    const { user, token } = await createUserAndToken({ coins: 12 });
    const stalePending = await Transaction.create({
      user: user._id,
      type: "package_purchase_pending",
      direction: "credit",
      amount: 300,
      currency: "coins",
      status: "pending",
      description: "Pending purchase of 300 coins via Paymob",
      metadata: {
        purpose: "coin_package",
        packageId: "coins_300",
        priceEGP: 140,
        provider: "paymob",
        paymobCurrency: "EGP",
      },
    });

    mockPaymobCheckout({ orderId: 777003, paymentToken: "coins-300-retry-token" });
    const res = await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_300" });

    expect(res.statusCode).toBe(201);
    expect(res.body.paymentUrl).toContain("payment_token=coins-300-retry-token");

    const expiredPending = await Transaction.findById(stalePending._id);
    expect(expiredPending.status).toBe("expired");
    expect(expiredPending.metadata.paymobExpiryReason).toBe("missing checkout URL");
    expect(
      await Transaction.countDocuments({
        user: user._id,
        type: "package_purchase_pending",
        "metadata.packageId": "coins_300",
        status: "pending",
      })
    ).toBe(1);
  });

  test("failed and expired coin package checkouts do not block retry", async () => {
    const { user, token } = await createUserAndToken({ coins: 12 });
    await Transaction.create([
      {
        user: user._id,
        type: "package_purchase_pending",
        direction: "credit",
        amount: 300,
        currency: "coins",
        status: "failed",
        description: "Coin package payment failed",
        metadata: {
          purpose: "coin_package",
          packageId: "coins_300",
          priceEGP: 140,
          provider: "paymob",
          paymobFailureReason: "payment not completed",
        },
      },
      {
        user: user._id,
        type: "package_purchase_pending",
        direction: "credit",
        amount: 300,
        currency: "coins",
        status: "expired",
        description: "Coin package checkout expired",
        metadata: {
          purpose: "coin_package",
          packageId: "coins_300",
          priceEGP: 140,
          provider: "paymob",
          paymobExpiredAt: new Date(),
        },
      },
    ]);

    mockPaymobCheckout({ orderId: 777004, paymentToken: "coins-300-after-inactive-token" });
    const res = await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_300" });

    expect(res.statusCode).toBe(201);
    expect(res.body.paymentUrl).toContain("payment_token=coins-300-after-inactive-token");
    expect(
      await Transaction.countDocuments({
        user: user._id,
        type: "package_purchase_pending",
        "metadata.packageId": "coins_300",
        status: "pending",
      })
    ).toBe(1);
    expect(
      await Transaction.countDocuments({
        user: user._id,
        type: "package_purchase_pending",
        "metadata.packageId": "coins_300",
        status: { $in: ["failed", "expired"] },
      })
    ).toBe(2);
  });

  test("service fee checkout creates a pending EGP transaction and does not mark the swap paid", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 12 });
    const { user: receiver } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    mockPaymobCheckout({ orderId: 881500, paymentToken: "service-fee-token" });

    const res = await request(app)
      .post(`/swaps/${swap._id}/service-fee/checkout`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(res.statusCode).toBe(201);
    expect(res.body.checkoutUrl).toContain("payment_token=service-fee-token");
    expect(res.body.paymentUrl).toContain("payment_token=service-fee-token");
    expect(res.body.iframeUrl).toContain("payment_token=service-fee-token");
    expect(res.body.canContinue).toBe(true);
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.side).toBe("requester");
    expect(res.body.amountEGP).toBe(SERVICE_FEE_EGP);

    const unchangedSwap = await SwapRequest.findById(swap._id);
    expect(unchangedSwap.requester_paid).toBe(false);
    expect(unchangedSwap.receiver_paid).toBe(false);
    expect(unchangedSwap.status).toBe("approved");

    const transaction = await Transaction.findOne({ user: requester._id, swap: swap._id });
    expect(transaction.type).toBe("service_fee");
    expect(transaction.status).toBe("pending");
    expect(transaction.direction).toBe("debit");
    expect(transaction.currency).toBe(SERVICE_FEE_CURRENCY);
    expect(transaction.amount).toBe(SERVICE_FEE_EGP);
    expect(transaction.metadata.purpose).toBe("service_fee");
    expect(transaction.metadata.payment_type).toBe("service_fee");
    expect(transaction.metadata.transaction_id).toBe(String(transaction._id));
    expect(transaction.metadata.transactionId).toBe(String(transaction._id));
    expect(transaction.metadata.serviceFeeSide).toBe("requester");
    expect(transaction.metadata.paymobOrderId).toBe("881500");
    expect(transaction.metadata.paymob_order_id).toBe("881500");
    expect(transaction.metadata.merchantOrderId).toBe(`svcfee_${transaction._id}`);
    expect(transaction.metadata.merchant_order_id).toBe(`svcfee_${transaction._id}`);
    expect(transaction.metadata.swap_id).toBe(String(swap._id));
    expect(transaction.metadata.payer_user_id).toBe(String(requester._id));

    const paymentKeyBody = JSON.parse(global.fetch.mock.calls[2][1].body);
    expect(paymentKeyBody.amount_cents).toBe(SERVICE_FEE_EGP * 100);
    expect(paymentKeyBody.currency).toBe(SERVICE_FEE_CURRENCY);
    expect(paymentKeyBody.redirection_url).toBe(process.env.PAYMOB_SUCCESS_URL);
  });

  test("service fee webhook marks only the paying participant and advances after both confirmed fees", async () => {
    const { user: requester } = await createUserAndToken({ coins: 12 });
    const { user: receiver } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    const requesterTransaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881501",
      merchantOrderId: "svcfee_requester_test",
    });
    const receiverTransaction = await createPendingPaymobServiceFeeTransaction({
      user: receiver,
      swap,
      side: "receiver",
      orderId: "881502",
      merchantOrderId: "svcfee_receiver_test",
    });

    const requesterPayload = createPaymobPayload({
      orderId: "881501",
      transactionId: 771501,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_requester_test",
    });
    const requesterHmac = createPaymobHmac(requesterPayload);
    const firstWebhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${requesterHmac}`)
      .send(requesterPayload);

    expect(firstWebhook.statusCode).toBe(200);
    expect(firstWebhook.body.message).toBe("Paymob payment completed");

    const afterRequester = await SwapRequest.findById(swap._id);
    expect(afterRequester.requester_paid).toBe(true);
    expect(afterRequester.receiver_paid).toBe(false);
    expect(afterRequester.status).toBe("payment_pending");

    const requesterAfterPayment = await User.findById(requester._id);
    expect(requesterAfterPayment.coins).toBe(12);

    const completedRequesterTransaction = await Transaction.findById(requesterTransaction._id);
    expect(completedRequesterTransaction.status).toBe("completed");
    expect(completedRequesterTransaction.type).toBe("service_fee");
    expect(completedRequesterTransaction.currency).toBe("EGP");
    expect(completedRequesterTransaction.metadata.serviceFeeAppliedAt).toBeTruthy();

    const receiverPayload = createPaymobPayload({
      orderId: "881502",
      transactionId: 771502,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_receiver_test",
    });
    const receiverHmac = createPaymobHmac(receiverPayload);
    const secondWebhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${receiverHmac}`)
      .send(receiverPayload);
    const duplicateWebhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${receiverHmac}`)
      .send(receiverPayload);

    expect(secondWebhook.statusCode).toBe(200);
    expect(secondWebhook.body.message).toBe("Paymob payment completed");
    expect(duplicateWebhook.statusCode).toBe(200);
    expect(duplicateWebhook.body.message).toBe("Paymob webhook already processed");

    const completedSwap = await SwapRequest.findById(swap._id);
    expect(completedSwap.requester_paid).toBe(true);
    expect(completedSwap.receiver_paid).toBe(true);
    expect(completedSwap.status).toBe("exchange_setup");

    const completedReceiverTransaction = await Transaction.findById(receiverTransaction._id);
    expect(completedReceiverTransaction.status).toBe("completed");
    expect(completedReceiverTransaction.metadata.serviceFeeAppliedAt).toBeTruthy();

    const timeline = await SwapTimelineEvent.find({ swap: swap._id });
    expect(timeline.some((event) => event.event === "service_fee_paid")).toBe(true);
    expect(timeline.some((event) => event.event === "service_fees_completed")).toBe(true);
  });

  test("service fee approval accepts Paymob success when txn response code is omitted", async () => {
    const { user: requester } = await createUserAndToken({ coins: 12 });
    const { user: receiver } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    const transaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881528",
      merchantOrderId: "svcfee_success_without_txn_code",
    });
    const payload = createPaymobPayload({
      orderId: "881528",
      transactionId: 771528,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_success_without_txn_code",
      txnResponseCode: null,
    });
    const hmac = createPaymobHmac(payload);

    const res = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paymob payment completed");

    const updatedSwap = await SwapRequest.findById(swap._id);
    expect(updatedSwap.requester_paid).toBe(true);
    expect(updatedSwap.receiver_paid).toBe(false);
    expect(updatedSwap.status).toBe("payment_pending");

    const completedTransaction = await Transaction.findById(transaction._id);
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("771528");
    expect(completedTransaction.metadata.paymobTxnResponseCode).toBeUndefined();
  });

  test("receiver sees unpaid service fee state after requester paid and receiver has no transaction", async () => {
    const { user: requester } = await createUserAndToken({ coins: 12 });
    const { user: receiver, token: receiverToken } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881520",
      merchantOrderId: "svcfee_requester_paid_receiver_unpaid",
    });

    const requesterPayload = createPaymobPayload({
      orderId: "881520",
      transactionId: 771520,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_requester_paid_receiver_unpaid",
    });
    const requesterHmac = createPaymobHmac(requesterPayload);
    await request(app)
      .post(`/payments/paymob/webhook?hmac=${requesterHmac}`)
      .send(requesterPayload);

    const res = await request(app)
      .get(`/swaps/${swap._id}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.requester_paid).toBe(true);
    expect(res.body.swap.receiver_paid).toBe(false);
    expect(res.body.swap.status).toBe("payment_pending");
    expect(res.body.swap.current_user_service_fee).toMatchObject({
      side: "receiver",
      paid: false,
      pending: false,
      status: "unpaid",
    });
  });

  test("receiver old final failed service fee is not pending and receiver can start a new checkout", async () => {
    const { user: requester } = await createUserAndToken({ coins: 12 });
    const { user: receiver, token: receiverToken } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    await SwapRequest.updateOne(
      { _id: swap._id },
      { $set: { requester_paid: true, status: "payment_pending" } }
    );
    const failedTransaction = await createPendingPaymobServiceFeeTransaction({
      user: receiver,
      swap,
      side: "receiver",
      orderId: "881521",
      merchantOrderId: "svcfee_receiver_failed_final",
    });
    await Transaction.updateOne(
      { _id: failedTransaction._id },
      {
        $set: {
          status: "failed",
          "metadata.paymobFailureReason": "payment not approved",
          "metadata.paymobFinalFailureVerifiedAt": new Date(),
          "metadata.paymobFinalFailureVerifiedBy": "test",
        },
      }
    );

    const statusRes = await request(app)
      .get(`/swaps/${swap._id}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.body.swap.current_user_service_fee).toMatchObject({
      side: "receiver",
      paid: false,
      pending: false,
      status: "failed",
      reason: "payment not approved",
    });

    mockPaymobCheckout({ orderId: 881522, paymentToken: "receiver-new-service-fee-token" });
    const checkoutRes = await request(app)
      .post(`/swaps/${swap._id}/service-fee/checkout`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send();

    expect(checkoutRes.statusCode).toBe(201);
    expect(checkoutRes.body.paymentUrl).toContain("payment_token=receiver-new-service-fee-token");
    expect(checkoutRes.body.side).toBe("receiver");

    const receiverTransactions = await Transaction.find({
      user: receiver._id,
      swap: swap._id,
      type: "service_fee",
    }).sort({ createdAt: 1 });
    expect(receiverTransactions).toHaveLength(2);
    expect(receiverTransactions[0].status).toBe("failed");
    expect(receiverTransactions[1].status).toBe("pending");
  });

  test("receiver active pending service fee state stays pending and checkout is not duplicated", async () => {
    const { user: requester, token: requesterToken } = await createUserAndToken({ coins: 12 });
    const { user: receiver, token: receiverToken } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    await SwapRequest.updateOne(
      { _id: swap._id },
      { $set: { requester_paid: true, status: "payment_pending" } }
    );
    const pendingTransaction = await createPendingPaymobServiceFeeTransaction({
      user: receiver,
      swap,
      side: "receiver",
      orderId: "881523",
      merchantOrderId: "svcfee_receiver_active_pending",
    });
    await Transaction.updateOne(
      { _id: pendingTransaction._id },
      {
        $set: {
          "metadata.paymobPaymentUrl": "https://accept.paymob.com/receiver-active-pending",
          "metadata.paymobIframeUrl": "https://accept.paymob.com/receiver-active-pending",
        },
      }
    );

    const statusRes = await request(app)
      .get(`/swaps/${swap._id}`)
      .set("Authorization", `Bearer ${receiverToken}`);

    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.body.swap.current_user_service_fee).toMatchObject({
      side: "receiver",
      paid: false,
      pending: true,
      status: "pending",
      checkout_url: "https://accept.paymob.com/receiver-active-pending",
      payment_url: "https://accept.paymob.com/receiver-active-pending",
      iframe_url: "https://accept.paymob.com/receiver-active-pending",
      can_continue: true,
    });

    const requesterStatusRes = await request(app)
      .get(`/swaps/${swap._id}`)
      .set("Authorization", `Bearer ${requesterToken}`);

    expect(requesterStatusRes.statusCode).toBe(200);
    expect(requesterStatusRes.body.swap.current_user_service_fee).toMatchObject({
      side: "requester",
      paid: true,
      pending: false,
      status: "completed",
      checkout_url: "",
      payment_url: "",
      iframe_url: "",
      can_continue: false,
    });
    expect(JSON.stringify(requesterStatusRes.body.swap.current_user_service_fee)).not.toContain(
      "receiver-active-pending"
    );

    global.fetch = jest.fn();
    const checkoutRes = await request(app)
      .post(`/swaps/${swap._id}/service-fee/checkout`)
      .set("Authorization", `Bearer ${receiverToken}`)
      .send();

    expect(checkoutRes.statusCode).toBe(200);
    expect(checkoutRes.body.message).toBe("Service fee checkout already pending");
    expect(checkoutRes.body.checkoutUrl).toBe("https://accept.paymob.com/receiver-active-pending");
    expect(checkoutRes.body.paymentUrl).toBe("https://accept.paymob.com/receiver-active-pending");
    expect(checkoutRes.body.iframeUrl).toBe("https://accept.paymob.com/receiver-active-pending");
    expect(checkoutRes.body.canContinue).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      await Transaction.countDocuments({
        user: receiver._id,
        swap: swap._id,
        type: "service_fee",
      })
    ).toBe(1);
  });

  test("unusable pending service fee checkout is expired and replaced on retry", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 12 });
    const { user: receiver } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    const unusablePending = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881524",
      merchantOrderId: "svcfee_missing_checkout_url",
    });

    mockPaymobCheckout({ orderId: 881525, paymentToken: "replacement-service-fee-token" });
    const checkoutRes = await request(app)
      .post(`/swaps/${swap._id}/service-fee/checkout`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(checkoutRes.statusCode).toBe(201);
    expect(checkoutRes.body.paymentUrl).toContain("payment_token=replacement-service-fee-token");

    const expiredPending = await Transaction.findById(unusablePending._id);
    expect(expiredPending.status).toBe("expired");
    expect(expiredPending.metadata.paymobExpiryReason).toBe("missing checkout URL");
    expect(
      await Transaction.countDocuments({
        user: requester._id,
        swap: swap._id,
        type: "service_fee",
        status: "pending",
      })
    ).toBe(1);
  });

  test("expired service fee checkout does not block a new checkout", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 12 });
    const { user: receiver } = await createUserAndToken({ coins: 14 });
    const swap = await createApprovedSwap({ requester, receiver });
    const expiredTransaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881526",
      merchantOrderId: "svcfee_expired_checkout",
    });
    await Transaction.updateOne(
      { _id: expiredTransaction._id },
      {
        $set: {
          status: "expired",
          "metadata.paymobExpiredAt": new Date(),
          "metadata.paymobExpiryReason": "test expiry",
        },
      }
    );

    mockPaymobCheckout({ orderId: 881527, paymentToken: "post-expired-service-fee-token" });
    const checkoutRes = await request(app)
      .post(`/swaps/${swap._id}/service-fee/checkout`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(checkoutRes.statusCode).toBe(201);
    expect(checkoutRes.body.paymentUrl).toContain("payment_token=post-expired-service-fee-token");
    expect(
      await Transaction.countDocuments({
        user: requester._id,
        swap: swap._id,
        type: "service_fee",
        status: "pending",
      })
    ).toBe(1);
    expect(
      await Transaction.countDocuments({
        user: requester._id,
        swap: swap._id,
        type: "service_fee",
        status: "expired",
      })
    ).toBe(1);
  });

  test("service fee return confirmation marks the authenticated participant fee paid", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const swap = await createApprovedSwap({ requester, receiver });
    await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881503",
      merchantOrderId: "svcfee_return_test",
    });
    const query = createPaymobReturnQuery({
      orderId: "881503",
      transactionId: 771503,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_return_test",
    });
    const remotePayload = createPaymobPayload({
      orderId: "881503",
      transactionId: 771503,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_return_test",
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paymob payment completed");
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.swapId).toBe(String(swap._id));
    expect(res.body.swap.id).toBe(String(swap._id));
    expect(res.body.wallet).toBeUndefined();

    const updatedSwap = await SwapRequest.findById(swap._id);
    expect(updatedSwap.requester_paid).toBe(true);
    expect(updatedSwap.receiver_paid).toBe(false);
    expect(updatedSwap.status).toBe("payment_pending");
  });

  test("service fee return does not fail from weak declined redirect params when server status is approved", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const swap = await createApprovedSwap({ requester, receiver });
    await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881509",
      merchantOrderId: "svcfee_return_weak_declined",
    });
    const query = createPaymobReturnQuery({
      orderId: "881509",
      transactionId: 771509,
      amountCents: SERVICE_FEE_EGP * 100,
      success: false,
      errorOccurred: true,
      txnResponseCode: "DECLINED",
      merchantOrderId: "svcfee_return_weak_declined",
    });
    const remotePayload = createPaymobPayload({
      orderId: "881509",
      transactionId: 771509,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_return_weak_declined",
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.purpose).toBe("service_fee");

    const recoveredTransaction = await Transaction.findOne({ user: requester._id, swap: swap._id });
    expect(recoveredTransaction.status).toBe("completed");
    expect(recoveredTransaction.metadata.paymobFailureReason).toBeUndefined();
  });

  test("service fee return confirmation explains pending verification without wallet data", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const swap = await createApprovedSwap({ requester, receiver });
    const transaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881504",
      merchantOrderId: "svcfee_return_pending",
    });
    const query = createPaymobReturnQuery({
      orderId: "881504",
      transactionId: 771504,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_return_pending",
    });
    delete query.hmac;
    global.fetch = jest.fn().mockRejectedValue(new Error("Paymob status unavailable"));

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(202);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("pending");
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.swapId).toBe(String(swap._id));
    expect(res.body.reason).toBe("Webhook not received yet or return confirmation could not be verified.");
    expect(res.body.wallet).toBeUndefined();

    const unchangedSwap = await SwapRequest.findById(swap._id);
    const unchangedTransaction = await Transaction.findById(transaction._id);
    expect(unchangedSwap.requester_paid).toBe(false);
    expect(unchangedSwap.status).toBe("approved");
    expect(unchangedTransaction.status).toBe("pending");
  });

  test("service fee reconcile confirms delayed Paymob status and is idempotent", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const swap = await createApprovedSwap({ requester, receiver });
    const transaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881506",
      merchantOrderId: "svcfee_reconcile_success",
    });
    const remotePayload = createPaymobPayload({
      orderId: "881506",
      transactionId: 771506,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_reconcile_success",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post(`/swaps/${swap._id}/service-fee/reconcile`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.swapId).toBe(String(swap._id));
    expect(res.body.wallet).toBeUndefined();

    const updatedSwap = await SwapRequest.findById(swap._id);
    expect(updatedSwap.requester_paid).toBe(true);
    expect(updatedSwap.receiver_paid).toBe(false);
    expect(updatedSwap.status).toBe("payment_pending");

    const updatedTransaction = await Transaction.findById(transaction._id);
    expect(updatedTransaction.status).toBe("completed");
    expect(updatedTransaction.metadata.serviceFeeAppliedAt).toBeTruthy();

    const duplicate = await request(app)
      .post(`/swaps/${swap._id}/service-fee/reconcile`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.body.success).toBe(true);
    expect(duplicate.body.status).toBe("completed");
    expect(await SwapTimelineEvent.countDocuments({ swap: swap._id, event: "service_fee_paid" })).toBe(1);
  });

  test("admin service fee reconcile recovers a non-final failed transaction by id", async () => {
    const { user: requester } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const { token: adminToken } = await createUserAndToken({ role: "admin" });
    const swap = await createApprovedSwap({ requester, receiver });
    const transaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881510",
      merchantOrderId: "svcfee_reconcile_failed_recoverable",
    });
    await Transaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          status: "failed",
          "metadata.paymobFailureReason": "payment not approved",
        },
      }
    );
    const remotePayload = createPaymobPayload({
      orderId: "881510",
      transactionId: 771510,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_reconcile_failed_recoverable",
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post(`/payments/paymob/reconcile/${transaction._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");

    const recoveredTransaction = await Transaction.findById(transaction._id);
    expect(recoveredTransaction.status).toBe("completed");
    expect(recoveredTransaction.metadata.paymobFailureReason).toBeUndefined();
    expect(recoveredTransaction.metadata.serviceFeeAppliedAt).toBeTruthy();
  });

  test("service fee reconcile keeps transaction pending when Paymob has not completed it", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const swap = await createApprovedSwap({ requester, receiver });
    const transaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881507",
      merchantOrderId: "svcfee_reconcile_pending",
    });
    await Transaction.updateOne(
      { _id: transaction._id },
      {
        $set: {
          "metadata.paymobPaymentUrl": "https://accept.paymob.com/requester-pending-reconcile",
          "metadata.paymobIframeUrl": "https://accept.paymob.com/requester-pending-reconcile",
        },
      }
    );
    const remotePayload = createPaymobPayload({
      orderId: "881507",
      transactionId: 771507,
      amountCents: SERVICE_FEE_EGP * 100,
      success: false,
      pending: true,
      merchantOrderId: "svcfee_reconcile_pending",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post(`/swaps/${swap._id}/service-fee/reconcile`)
      .set("Authorization", `Bearer ${token}`)
      .send();

    expect(res.statusCode).toBe(202);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("pending");
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.swapId).toBe(String(swap._id));
    expect(res.body.reason).toBe("Paymob payment is still pending.");
    expect(res.body.checkoutUrl).toBe("https://accept.paymob.com/requester-pending-reconcile");
    expect(res.body.paymentUrl).toBe("https://accept.paymob.com/requester-pending-reconcile");
    expect(res.body.iframeUrl).toBe("https://accept.paymob.com/requester-pending-reconcile");
    expect(res.body.canContinue).toBe(true);

    const unchangedSwap = await SwapRequest.findById(swap._id);
    const unchangedTransaction = await Transaction.findById(transaction._id);
    expect(unchangedSwap.requester_paid).toBe(false);
    expect(unchangedSwap.status).toBe("approved");
    expect(unchangedTransaction.status).toBe("pending");
    expect(unchangedTransaction.metadata.paymobPendingReason).toBe("payment still pending");
  });

  test("admin Paymob reconcile uses verified service fee logic", async () => {
    const { user: requester } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const { token: adminToken } = await createUserAndToken({ role: "admin" });
    const swap = await createApprovedSwap({ requester, receiver });
    const transaction = await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881508",
      merchantOrderId: "svcfee_admin_reconcile",
    });
    const remotePayload = createPaymobPayload({
      orderId: "881508",
      transactionId: 771508,
      amountCents: SERVICE_FEE_EGP * 100,
      merchantOrderId: "svcfee_admin_reconcile",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post(`/payments/paymob/reconcile/${transaction._id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send();

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.swapId).toBe(String(swap._id));

    const updatedSwap = await SwapRequest.findById(swap._id);
    expect(updatedSwap.requester_paid).toBe(true);
  });

  test("failed service fee return keeps service fee purpose and swap link", async () => {
    const { user: requester, token } = await createUserAndToken({ coins: 9 });
    const { user: receiver } = await createUserAndToken({ coins: 9 });
    const swap = await createApprovedSwap({ requester, receiver });
    await createPendingPaymobServiceFeeTransaction({
      user: requester,
      swap,
      side: "requester",
      orderId: "881505",
      merchantOrderId: "svcfee_return_failed",
    });
    const query = createPaymobReturnQuery({
      orderId: "881505",
      transactionId: 771505,
      amountCents: SERVICE_FEE_EGP * 100,
      success: false,
      errorOccurred: true,
      txnResponseCode: "DECLINED",
      merchantOrderId: "svcfee_return_failed",
    });
    const remotePayload = createPaymobPayload({
      orderId: "881505",
      transactionId: 771505,
      amountCents: SERVICE_FEE_EGP * 100,
      success: false,
      errorOccurred: true,
      txnResponseCode: "DECLINED",
      merchantOrderId: "svcfee_return_failed",
    });
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("failed");
    expect(res.body.purpose).toBe("service_fee");
    expect(res.body.swapId).toBe(String(swap._id));
    expect(res.body.reason).toBe("Paymob payment was not approved.");
    expect(res.body.wallet).toBeUndefined();

    const unchangedSwap = await SwapRequest.findById(swap._id);
    const failedTransaction = await Transaction.findOne({ user: requester._id, swap: swap._id });
    expect(unchangedSwap.requester_paid).toBe(false);
    expect(unchangedSwap.status).toBe("approved");
    expect(failedTransaction.status).toBe("failed");
    expect(failedTransaction.metadata.paymobFailureReason).toBe("payment not approved");
    expect(failedTransaction.metadata.paymobFinalFailureVerifiedAt).toBeTruthy();
  });

  test("verified successful webhook credits coins once and completes the pending transaction", async () => {
    const { user, token } = await createUserAndToken({ coins: 7 });
    mockPaymobCheckout({ orderId: 888001 });

    await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_100" });

    const payload = createPaymobPayload({ orderId: 888001, transactionId: 123001 });
    const hmac = createPaymobHmac(payload);

    const firstWebhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(firstWebhook.statusCode).toBe(200);
    expect(firstWebhook.body.message).toBe("Paymob payment completed");

    const afterFirstWebhook = await User.findById(user._id);
    expect(afterFirstWebhook.coins).toBe(107);
    expect(afterFirstWebhook.total_coins_earned).toBe(100);

    const completedTransaction = await Transaction.findOne({ user: user._id });
    expect(completedTransaction.type).toBe("package_purchase_completed");
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("123001");
    expect(completedTransaction.metadata.coinCreditedAt).toBeTruthy();
    expect(await Notification.countDocuments({ user: user._id, target_type: "wallet" })).toBe(1);

    const duplicateWebhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(duplicateWebhook.statusCode).toBe(200);
    expect(duplicateWebhook.body.message).toBe("Paymob webhook already processed");

    const afterDuplicateWebhook = await User.findById(user._id);
    expect(afterDuplicateWebhook.coins).toBe(107);
    expect(afterDuplicateWebhook.total_coins_earned).toBe(100);
    expect(await Notification.countDocuments({ user: user._id, target_type: "wallet" })).toBe(1);

    const walletRes = await request(app)
      .get("/users/me/wallet")
      .set("Authorization", `Bearer ${token}`);
    const completedHistory = walletRes.body.wallet.transactions.find(
      (item) => item.type === "package_purchase_completed"
    );
    expect(completedHistory).toMatchObject({
      amount: 100,
      currency: "coins",
      status: "completed",
    });
    expect(completedHistory.checkout_url).toBeUndefined();
    expect(completedHistory.can_continue).toBeUndefined();
  });

  test("webhook matches Paymob payloads where order is a primitive id", async () => {
    const { user, token } = await createUserAndToken({ coins: 11 });
    mockPaymobCheckout({ orderId: 888002 });

    await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_100" });

    const payload = createPaymobPayload({
      orderId: 888002,
      transactionId: 123002,
      orderShape: "primitive",
    });
    const hmac = createPaymobHmac(payload);

    const webhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(webhook.statusCode).toBe(200);
    expect(webhook.body.message).toBe("Paymob payment completed");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(111);

    const completedTransaction = await Transaction.findOne({ user: user._id });
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.metadata.paymobOrderId).toBe("888002");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("123002");
  });

  test("webhook can match by stored Paymob transaction id when order id is absent", async () => {
    const { user } = await createUserAndToken({ coins: 4 });

    await Transaction.create({
      user: user._id,
      type: "package_purchase_pending",
      direction: "credit",
      amount: 100,
      currency: "coins",
      status: "pending",
      description: "Pending purchase of 100 coins via Paymob",
      metadata: {
        packageId: "coins_100",
        priceEGP: 50,
        provider: "paymob",
        paymobTransactionId: "424242",
        paymobAmountCents: 5000,
        paymobCurrency: "EGP",
      },
    });

    const payload = createPaymobPayload({
      transactionId: 424242,
      orderShape: "none",
    });
    const hmac = createPaymobHmac(payload);

    const webhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(webhook.statusCode).toBe(200);
    expect(webhook.body.message).toBe("Paymob payment completed");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(104);

    const completedTransaction = await Transaction.findOne({ user: user._id });
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("424242");
  });

  test("failed webhook marks the purchase failed and does not credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 3 });
    mockPaymobCheckout({ orderId: 999001 });

    await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_100" });

    const payload = createPaymobPayload({
      orderId: 999001,
      transactionId: 223001,
      success: false,
      errorOccurred: true,
    });
    const hmac = createPaymobHmac(payload);

    const webhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(webhook.statusCode).toBe(200);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(3);
    expect(updatedUser.total_coins_earned).toBe(0);

    const failedTransaction = await Transaction.findOne({ user: user._id });
    expect(failedTransaction.status).toBe("failed");
    expect(failedTransaction.type).toBe("package_purchase_pending");
    expect(failedTransaction.metadata.paymobFailureReason).toBe("payment error occurred");
  });

  test("webhook rejects invalid HMAC and does not change wallet state", async () => {
    const { user, token } = await createUserAndToken({ coins: 5 });
    mockPaymobCheckout({ orderId: 111001 });

    await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_100" });

    const payload = createPaymobPayload({ orderId: 111001, transactionId: 323001 });

    const webhook = await request(app)
      .post("/payments/paymob/webhook?hmac=bad-signature")
      .send(payload);

    expect(webhook.statusCode).toBe(401);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(5);
    expect(updatedUser.total_coins_earned).toBe(0);

    const transaction = await Transaction.findOne({ user: user._id });
    expect(transaction.status).toBe("pending");
  });

  test("webhook rejects amount mismatch and does not credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 9 });
    mockPaymobCheckout({ orderId: 222001 });

    await request(app)
      .post("/users/me/wallet/packages/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ packageId: "coins_100" });

    const payload = createPaymobPayload({
      orderId: 222001,
      transactionId: 423001,
      amountCents: 5100,
    });
    const hmac = createPaymobHmac(payload);

    const webhook = await request(app)
      .post(`/payments/paymob/webhook?hmac=${hmac}`)
      .send(payload);

    expect(webhook.statusCode).toBe(400);
    expect(webhook.body.message).toBe("Paymob amount or currency mismatch");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(9);
    expect(updatedUser.total_coins_earned).toBe(0);

    const transaction = await Transaction.findOne({ user: user._id });
    expect(transaction.status).toBe("failed");
    expect(transaction.metadata.paymobFailureReason).toBe("amount or currency mismatch");
  });

  test("valid return confirmation credits coins once and returns the updated wallet", async () => {
    const { user, token } = await createUserAndToken({ coins: 13 });
    await createPendingPaymobPackageTransaction({
      user,
      orderId: "700001",
      merchantOrderId: "coinpkg_return_valid",
    });
    const query = createPaymobReturnQuery({
      orderId: "700001",
      transactionId: 700901,
      merchantOrderId: "coinpkg_return_valid",
    });

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paymob payment completed");
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.purpose).toBe("coin_package");
    expect(res.body.swapId).toBeUndefined();
    expect(res.body.wallet.coins).toBe(113);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(113);
    expect(updatedUser.total_coins_earned).toBe(100);

    const completedTransaction = await Transaction.findOne({ user: user._id });
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.type).toBe("package_purchase_completed");
    expect(completedTransaction.metadata.paymobCompletedBy).toBe("return");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("700901");
    expect(await Notification.countDocuments({ user: user._id, target_type: "wallet" })).toBe(1);
  });

  test("coin return confirmation accepts Paymob success when txn response code is omitted", async () => {
    const { user, token } = await createUserAndToken({ coins: 13 });
    await createPendingPaymobPackageTransaction({
      user,
      orderId: "700011",
      merchantOrderId: "coinpkg_return_without_txn_code",
    });
    const query = createPaymobReturnQuery({
      orderId: "700011",
      transactionId: 700911,
      merchantOrderId: "coinpkg_return_without_txn_code",
      txnResponseCode: null,
    });

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paymob payment completed");
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("completed");
    expect(res.body.wallet.coins).toBe(113);

    const completedTransaction = await Transaction.findOne({ user: user._id });
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("700911");
    expect(completedTransaction.metadata.paymobTxnResponseCode).toBeUndefined();
  });

  test("duplicate return confirmation does not double-credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 21 });
    await createPendingPaymobPackageTransaction({
      user,
      orderId: "700002",
      merchantOrderId: "coinpkg_return_duplicate",
    });
    const query = createPaymobReturnQuery({
      orderId: "700002",
      transactionId: 700902,
      merchantOrderId: "coinpkg_return_duplicate",
    });

    const first = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });
    const duplicate = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(first.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.body.message).toBe("Paymob webhook already processed");
    expect(duplicate.body.success).toBe(true);
    expect(duplicate.body.status).toBe("completed");
    expect(duplicate.body.purpose).toBe("coin_package");
    expect(duplicate.body.wallet.coins).toBe(121);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(121);
    expect(updatedUser.total_coins_earned).toBe(100);
    expect(await Notification.countDocuments({ user: user._id, target_type: "wallet" })).toBe(1);
  });

  test("return confirmation rejects invalid HMAC and does not credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 17 });
    await createPendingPaymobPackageTransaction({
      user,
      orderId: "700003",
      merchantOrderId: "coinpkg_return_bad_hmac",
    });
    const query = {
      ...createPaymobReturnQuery({
        orderId: "700003",
        transactionId: 700903,
        merchantOrderId: "coinpkg_return_bad_hmac",
      }),
      hmac: "bad-return-signature",
    };

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Invalid Paymob return signature");
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("pending");
    expect(res.body.purpose).toBe("coin_package");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(17);
    expect(updatedUser.total_coins_earned).toBe(0);

    const transaction = await Transaction.findOne({ user: user._id });
    expect(transaction.status).toBe("pending");
  });

  test("return confirmation rejects wrong amount and does not credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 19 });
    await createPendingPaymobPackageTransaction({
      user,
      orderId: "700004",
      merchantOrderId: "coinpkg_return_wrong_amount",
    });
    const query = createPaymobReturnQuery({
      orderId: "700004",
      transactionId: 700904,
      amountCents: 5100,
      merchantOrderId: "coinpkg_return_wrong_amount",
    });

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Paymob amount or currency mismatch");
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("failed");
    expect(res.body.purpose).toBe("coin_package");
    expect(res.body.wallet.coins).toBe(19);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(19);
    expect(updatedUser.total_coins_earned).toBe(0);

    const transaction = await Transaction.findOne({ user: user._id });
    expect(transaction.status).toBe("failed");
    expect(transaction.metadata.paymobFailureReason).toBe("amount or currency mismatch");
  });

  test("failed return payment params do not credit coins", async () => {
    const { user, token } = await createUserAndToken({ coins: 23 });
    await createPendingPaymobPackageTransaction({
      user,
      orderId: "700005",
      merchantOrderId: "coinpkg_return_failed",
    });
    const query = createPaymobReturnQuery({
      orderId: "700005",
      transactionId: 700905,
      success: false,
      errorOccurred: true,
      txnResponseCode: "DECLINED",
      merchantOrderId: "coinpkg_return_failed",
    });

    const res = await request(app)
      .post("/payments/paymob/confirm-return")
      .set("Authorization", `Bearer ${token}`)
      .send({ query });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Paymob payment was not approved");
    expect(res.body.success).toBe(false);
    expect(res.body.status).toBe("failed");
    expect(res.body.purpose).toBe("coin_package");
    expect(res.body.wallet.coins).toBe(23);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(23);
    expect(updatedUser.total_coins_earned).toBe(0);

    const transaction = await Transaction.findOne({ user: user._id });
    expect(transaction.status).toBe("failed");
    expect(transaction.metadata.paymobFailureReason).toBe("payment not approved");
  });

  test("reconcile fetches Paymob status by stored order metadata and completes pending credit", async () => {
    const { user } = await createUserAndToken({ coins: 6 });
    const transaction = await Transaction.create({
      user: user._id,
      type: "package_purchase_pending",
      direction: "credit",
      amount: 100,
      currency: "coins",
      status: "pending",
      description: "Pending purchase of 100 coins via Paymob",
      metadata: {
        packageId: "coins_100",
        priceEGP: 50,
        provider: "paymob",
        merchantOrderId: "coinpkg_reconcile_test",
        paymobOrderId: "777777",
        paymobAmountCents: 5000,
        paymobCurrency: "EGP",
      },
    });
    const remotePayload = createPaymobPayload({
      orderId: 777777,
      transactionId: 777001,
      merchantOrderId: "coinpkg_reconcile_test",
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "auth-token" }))
      .mockResolvedValueOnce(jsonResponse({ transaction: remotePayload.obj }));

    const res = await request(app)
      .post(`/payments/paymob/reconcile/${transaction._id}`)
      .set("x-payment-dev-token", process.env.PAYMENT_DEV_TOKEN)
      .send();

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Paymob payment completed");

    const inquiryBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(global.fetch.mock.calls[1][0]).toContain("/ecommerce/orders/transaction_inquiry");
    expect(inquiryBody.order_id).toBe("777777");
    expect(inquiryBody.merchant_order_id).toBe("coinpkg_reconcile_test");

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.coins).toBe(106);

    const completedTransaction = await Transaction.findById(transaction._id);
    expect(completedTransaction.status).toBe("completed");
    expect(completedTransaction.type).toBe("package_purchase_completed");
    expect(completedTransaction.metadata.paymobTransactionId).toBe("777001");
    expect(completedTransaction.metadata.coinCreditedAt).toBeTruthy();
  });

  test("stale pending cleanup expires only old pending Paymob package purchases", async () => {
    const { user } = await createUserAndToken({ coins: 1 });
    const oldDate = new Date(Date.now() - 31 * 60 * 1000);
    const freshDate = new Date(Date.now() - 5 * 60 * 1000);
    const [oldPending, freshPending, completed] = await Transaction.create([
      {
        user: user._id,
        type: "package_purchase_pending",
        direction: "credit",
        amount: 100,
        status: "pending",
        description: "Old pending package",
        metadata: { provider: "paymob", packageId: "coins_100" },
      },
      {
        user: user._id,
        type: "package_purchase_pending",
        direction: "credit",
        amount: 100,
        status: "pending",
        description: "Fresh pending package",
        metadata: { provider: "paymob", packageId: "coins_100" },
      },
      {
        user: user._id,
        type: "package_purchase_completed",
        direction: "credit",
        amount: 100,
        status: "completed",
        description: "Completed package",
        metadata: { provider: "paymob", packageId: "coins_100" },
      },
    ]);

    await Transaction.collection.updateOne({ _id: oldPending._id }, { $set: { createdAt: oldDate } });
    await Transaction.collection.updateOne({ _id: freshPending._id }, { $set: { createdAt: freshDate } });
    await Transaction.collection.updateOne({ _id: completed._id }, { $set: { createdAt: oldDate } });

    const res = await request(app)
      .post("/payments/paymob/expire-pending")
      .set("x-payment-dev-token", process.env.PAYMENT_DEV_TOKEN)
      .send({ olderThanMinutes: 30 });

    expect(res.statusCode).toBe(200);
    expect(res.body.expiredCount).toBe(1);

    const expiredTransaction = await Transaction.findById(oldPending._id);
    const freshTransaction = await Transaction.findById(freshPending._id);
    const completedTransaction = await Transaction.findById(completed._id);

    expect(expiredTransaction.status).toBe("expired");
    expect(freshTransaction.status).toBe("pending");
    expect(completedTransaction.status).toBe("completed");
  });
});
