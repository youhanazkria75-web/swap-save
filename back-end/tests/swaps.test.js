process.env.JWT_SECRET = "test_jwt_secret";

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const Message = require("../src/models/Message");
const Notification = require("../src/models/Notification");
const Product = require("../src/models/Product");
const Rating = require("../src/models/Rating");
const SwapRequest = require("../src/models/SwapRequest");
const SwapTimelineEvent = require("../src/models/SwapTimelineEvent");
const Transaction = require("../src/models/Transaction");
const User = require("../src/models/User");

let mongoServer;

let user1Token;
let user2Token;
let adminToken;
let user1Id;
let user2Id;

let product1;
let product2;
let swapId;
let fixtureCounter = 0;

beforeAll(async () => {

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  await mongoose.connect(uri);

  const user1 = await User.create({
    first_name: "User",
    last_name: "One",
    email: "user1@test.com",
    password: "hashed",
    isEmailVerified: true,
  });

  const user2 = await User.create({
    first_name: "User",
    last_name: "Two",
    email: "user2@test.com",
    password: "hashed",
    isEmailVerified: true,
  });

  const admin = await User.create({
    first_name: "Admin",
    last_name: "User",
    email: "admin@test.com",
    password: "hashed",
    role: "admin",
    isEmailVerified: true,
  });

  user1Id = user1._id;
  user2Id = user2._id;

  user1Token = jwt.sign({ userId: user1._id }, process.env.JWT_SECRET);
  user2Token = jwt.sign({ userId: user2._id }, process.env.JWT_SECRET);
  adminToken = jwt.sign({ userId: admin._id }, process.env.JWT_SECRET);

  // USER1 creates product
  const p1 = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${user1Token}`)
    .send({
      title: "Laptop",
      description: "Gaming laptop",
      category: "Electronics",
      condition: "good",
      estimated_value: 15000,
      location: "Cairo",
      images: ["/uploads/products/swap-laptop.jpg"],
    });

  product1 = p1.body.product;

  // USER2 creates product
  const p2 = await request(app)
    .post("/products")
    .set("Authorization", `Bearer ${user2Token}`)
    .send({
      title: "iPhone",
      description: "iPhone 12 in good condition",
      category: "Electronics",
      condition: "good",
      estimated_value: 12000,
      location: "Alex",
      images: ["/uploads/products/swap-iphone.jpg"],
    });

  product2 = p2.body.product;

});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

const makeDeliveryDetails = () => ({
  requester_pickup: {
    address: "1 Test Street",
    country: "Egypt",
    city: "Cairo",
    area: "Nasr City",
    preferred_date: "2026-05-01",
    preferred_time: "10:00",
    submitted: true,
  },
  receiver_pickup: {
    address: "2 Test Street",
    country: "Egypt",
    city: "Giza",
    area: "Dokki",
    preferred_date: "2026-05-01",
    preferred_time: "11:00",
    submitted: true,
  },
  fee_per_user: 100,
  payment_method: "cash_to_courier",
  delivery_status: "pending_pickup",
  tracking: {
    requester_item_picked_up: false,
    receiver_item_picked_up: false,
    delivered_to_requester: false,
    delivered_to_receiver: false,
  },
});

const createDeliverySwap = async (overrides = {}) => {
  const offered = await Product.create({
    owner_id: user1Id,
    title: `Delivery Offered ${Date.now()}`,
    description: "Delivery offered product",
    category: "Electronics",
    condition: "Used",
    estimated_value: 1000,
    location: "Cairo",
    status: "reserved",
  });

  const requested = await Product.create({
    owner_id: user2Id,
    title: `Delivery Requested ${Date.now()}`,
    description: "Delivery requested product",
    category: "Electronics",
    condition: "Used",
    estimated_value: 1100,
    location: "Giza",
    status: "reserved",
  });

  return SwapRequest.create({
    requester: user1Id,
    receiver: user2Id,
    product_offered: offered._id,
    product_requested: requested._id,
    status: "in_progress",
    requester_paid: true,
    receiver_paid: true,
    exchange_method: "delivery",
    delivery_details: makeDeliveryDetails(),
    ...overrides,
  });
};

const createCompletedSwap = async ({ requester = user1Id, receiver = user2Id } = {}) => {
  const offered = await Product.create({
    owner_id: requester,
    title: `Completed Offered ${Date.now()}`,
    description: "Completed offered product",
    category: "Electronics",
    condition: "Used",
    estimated_value: 900,
    location: "Cairo",
    status: "swapped",
  });

  const requested = await Product.create({
    owner_id: receiver,
    title: `Completed Requested ${Date.now()}`,
    description: "Completed requested product",
    category: "Electronics",
    condition: "Used",
    estimated_value: 900,
    location: "Giza",
    status: "swapped",
  });

  return SwapRequest.create({
    requester,
    receiver,
    product_offered: offered._id,
    product_requested: requested._id,
    status: "completed",
    requester_paid: true,
    receiver_paid: true,
    requester_confirmed: true,
    receiver_confirmed: true,
    completed_at: new Date(),
  });
};

const nextFixtureId = () => `${Date.now()}-${fixtureCounter++}`;

const formatDateValue = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const futureDateValue = (days = 2) =>
  formatDateValue(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

const pastDateValue = () =>
  formatDateValue(new Date(Date.now() - 24 * 60 * 60 * 1000));

const createExchangeSetupSwap = async (overrides = {}) => {
  const requester = overrides.requester || user1Id;
  const receiver = overrides.receiver || user2Id;
  const fixtureId = nextFixtureId();

  const offered = await Product.create({
    owner_id: requester,
    title: `Exchange Offered ${fixtureId}`,
    description: "Exchange setup offered product",
    category: "Electronics",
    condition: "good",
    estimated_value: 1000,
    location: "Cairo",
    status: "reserved",
  });

  const requested = await Product.create({
    owner_id: receiver,
    title: `Exchange Requested ${fixtureId}`,
    description: "Exchange setup requested product",
    category: "Electronics",
    condition: "good",
    estimated_value: 1100,
    location: "Giza",
    status: "reserved",
  });

  return SwapRequest.create({
    requester,
    receiver,
    product_offered: offered._id,
    product_requested: requested._id,
    status: "exchange_setup",
    requester_paid: true,
    receiver_paid: true,
    exchange_proposal_status: "none",
    ...overrides,
  });
};

const createCancellationSwap = async ({
  requester = user1Id,
  receiver = user2Id,
  status = "pending",
  offeredStatus = "reserved",
  requestedStatus = "reserved",
  swapOverrides = {},
} = {}) => {
  const fixtureId = nextFixtureId();
  const offered = await Product.create({
    owner_id: requester,
    title: `Cancel Offered ${fixtureId}`,
    description: "Cancellation offered product",
    category: "Electronics",
    condition: "good",
    estimated_value: 1000,
    location: "Cairo",
    status: offeredStatus,
  });
  const requested = await Product.create({
    owner_id: receiver,
    title: `Cancel Requested ${fixtureId}`,
    description: "Cancellation requested product",
    category: "Books",
    condition: "good",
    estimated_value: 1000,
    location: "Giza",
    status: requestedStatus,
  });
  const swap = await SwapRequest.create({
    requester,
    receiver,
    product_offered: offered._id,
    product_requested: requested._id,
    status,
    ...swapOverrides,
  });

  return { swap, offered, requested };
};

const validMeetupPayload = (overrides = {}) => ({
  exchange_method: "meetup",
  meetup_details: {
    city: "Cairo",
    area: "Nasr City",
    meeting_point: "Citystars Mall",
    date: futureDateValue(),
    time: "10:00",
    additional_notes: "Meet near the main entrance.",
    ...overrides,
  },
});

const validDeliveryPayload = (overrides = {}) => ({
  exchange_method: "delivery",
  delivery_details: {
    pickup_address: "12 Nile Street, Building 4",
    pickup_country: "Egypt",
    pickup_city: "Giza",
    pickup_area: "Dokki",
    preferred_pickup_date: futureDateValue(),
    preferred_pickup_time: "10:00",
    pickup_notes: "Call before arriving.",
    ...overrides,
  },
});

describe("Swaps API", () => {

  test("Create swap request", async () => {

    const res = await request(app)
      .post("/swaps/request")
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        product_offered: product1._id,
        product_requested: product2._id
      });

    expect(res.statusCode).toBe(201);

    swapId = res.body.swap._id;

  });

  test("Get sent swaps", async () => {

    const res = await request(app)
      .get("/swaps/sent")
      .set("Authorization", `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.swaps)).toBe(true);

  });

  test("Get received swaps", async () => {

    const res = await request(app)
      .get("/swaps/received")
      .set("Authorization", `Bearer ${user2Token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.swaps)).toBe(true);

  });

  test("Swap detail participant trust metrics match profile metrics", async () => {
    const requester = await User.create({
      first_name: "Trust",
      last_name: "Aligned",
      email: `trust-aligned-${Date.now()}@test.com`,
      password: "hashed",
      phone: "+201001234567",
      bio: "Careful swapper",
      country: "Egypt",
      city: "Cairo",
      street_address: "15 Abbas El Akkad",
      avatar: "/uploads/avatars/trust-aligned.png",
      isEmailVerified: true,
      isPhoneVerified: true,
    });
    const receiver = await User.create({
      first_name: "Trust",
      last_name: "Receiver",
      email: `trust-receiver-${Date.now()}@test.com`,
      password: "hashed",
      isEmailVerified: true,
    });
    const token = jwt.sign({ userId: requester._id }, process.env.JWT_SECRET);
    const offered = await Product.create({
      owner_id: requester._id,
      title: `Trust Offered ${Date.now()}`,
      description: "Trust offered product",
      category: "Electronics",
      condition: "Used",
      estimated_value: 1000,
      location: "Cairo",
      status: "reserved",
    });
    const requested = await Product.create({
      owner_id: receiver._id,
      title: `Trust Requested ${Date.now()}`,
      description: "Trust requested product",
      category: "Electronics",
      condition: "Used",
      estimated_value: 1000,
      location: "Giza",
      status: "reserved",
    });
    const swap = await SwapRequest.create({
      requester: requester._id,
      receiver: receiver._id,
      product_offered: offered._id,
      product_requested: requested._id,
      status: "in_discussion",
    });

    const [profileRes, publicProfileRes, swapRes] = await Promise.all([
      request(app).get("/users/me").set("Authorization", `Bearer ${token}`),
      request(app).get(`/users/${requester._id}`),
      request(app).get(`/swaps/${swap._id}`).set("Authorization", `Bearer ${token}`),
    ]);

    expect(profileRes.statusCode).toBe(200);
    expect(publicProfileRes.statusCode).toBe(200);
    expect(swapRes.statusCode).toBe(200);

    const profileUser = profileRes.body.user;
    const publicProfileUser = publicProfileRes.body.user;
    const swapRequester = swapRes.body.swap.requester;

    expect(swapRequester.trust_score).toBe(profileUser.trust_score);
    expect(swapRequester.completed_swaps).toBe(profileUser.completed_swaps);
    expect(swapRequester.total_swaps).toBe(profileUser.total_swaps);
    expect(swapRequester.rating).toBe(profileUser.rating);
    expect(swapRequester.rating_count).toBe(profileUser.rating_count);
    expect(publicProfileUser.trust_score).toBe(profileUser.trust_score);
    expect(publicProfileUser.completed_swaps).toBe(profileUser.completed_swaps);
    expect(publicProfileUser.total_swaps).toBe(profileUser.total_swaps);
    expect(publicProfileUser.rating).toBe(profileUser.rating);
    expect(publicProfileUser.rating_count).toBe(profileUser.rating_count);
    expect(swapRequester.trust_score).toBe(55);
    expect(swapRequester.completed_swaps).toBe(0);
    expect(swapRequester.total_swaps).toBe(1);
    expect(swapRequester.phone).toBeUndefined();
    expect(swapRequester.street_address).toBeUndefined();
  });

  test("Accept swap request", async () => {

    const res = await request(app)
      .patch(`/swaps/${swapId}/accept`)
      .set("Authorization", `Bearer ${user2Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("in_discussion");

    const acceptedSwap = await SwapRequest.findById(swapId);
    const offeredProduct = await Product.findById(product1._id);
    const requestedProduct = await Product.findById(product2._id);

    expect(acceptedSwap.status).toBe("in_discussion");
    expect(offeredProduct.status).toBe("available");
    expect(requestedProduct.status).toBe("available");

  });

  test("Requester can cancel a pending swap and release reserved products", async () => {
    const { swap, offered, requested } = await createCancellationSwap();

    const res = await request(app)
      .patch(`/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("cancelled");
    expect(res.body.swap.timeline.some((event) => event.event === "cancelled")).toBe(true);

    const [cancelledSwap, offeredAfter, requestedAfter] = await Promise.all([
      SwapRequest.findById(swap._id),
      Product.findById(offered._id),
      Product.findById(requested._id),
    ]);
    expect(cancelledSwap.status).toBe("cancelled");
    expect(offeredAfter.status).toBe("available");
    expect(requestedAfter.status).toBe("available");
  });

  test("Receiver can cancel an in-discussion swap and the requester is notified", async () => {
    const { swap } = await createCancellationSwap({ status: "in_discussion" });

    const res = await request(app)
      .patch(`/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${user2Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("cancelled");

    const notification = await Notification.findOne({
      user: user1Id,
      related_swap: swap._id,
      title: "Swap cancelled",
    });
    expect(notification).toBeTruthy();

    const timeline = await SwapTimelineEvent.findOne({
      swap: swap._id,
      event: "cancelled",
    });
    expect(timeline.actor).toBe("receiver");
    expect(String(timeline.actor_id)).toBe(String(user2Id));
  });

  test("Non-participants cannot cancel a swap through the participant endpoint", async () => {
    const { swap } = await createCancellationSwap();

    const res = await request(app)
      .patch(`/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Swap request not found");

    const unchangedSwap = await SwapRequest.findById(swap._id);
    expect(unchangedSwap.status).toBe("pending");
  });

  test.each(["completed", "rejected", "cancelled"])(
    "Participant cannot cancel a %s swap",
    async (status) => {
      const { swap } = await createCancellationSwap({
        status,
        offeredStatus: status === "completed" ? "swapped" : "reserved",
        requestedStatus: status === "completed" ? "swapped" : "reserved",
      });

      const res = await request(app)
        .patch(`/swaps/${swap._id}/cancel`)
        .set("Authorization", `Bearer ${user1Token}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/Cancellation is not available/i);
    }
  );

  test("Participant cannot cancel payment-pending swap after a service fee is confirmed", async () => {
    const { swap } = await createCancellationSwap({
      status: "payment_pending",
      swapOverrides: {
        requester_paid: true,
      },
    });

    await Transaction.create({
      user: user1Id,
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
      .patch(`/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${user2Token}`);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/confirmed service fee/i);

    const unchangedSwap = await SwapRequest.findById(swap._id);
    expect(unchangedSwap.status).toBe("payment_pending");
  });

  test("User cancellation expires unpaid pending service fee transactions", async () => {
    const { swap } = await createCancellationSwap({ status: "approved" });
    const pendingTransaction = await Transaction.create({
      user: user1Id,
      swap: swap._id,
      type: "service_fee",
      direction: "debit",
      amount: 15,
      currency: "EGP",
      status: "pending",
      description: "Pending requester service fee",
      metadata: {
        provider: "paymob",
        purpose: "service_fee",
        serviceFeeSide: "requester",
      },
    });

    const res = await request(app)
      .patch(`/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.expired_service_fee_transactions).toBe(1);

    const expiredTransaction = await Transaction.findById(pendingTransaction._id);
    expect(expiredTransaction.status).toBe("expired");
    expect(expiredTransaction.metadata.cancelledWithSwap).toBe(true);
    expect(expiredTransaction.metadata.serviceFeeExpiredByActor).toBe("requester");
  });

  test("Cancelling one swap does not release a shared reserved product used by another active swap", async () => {
    const { swap, offered, requested } = await createCancellationSwap({ status: "approved" });
    const otherRequested = await Product.create({
      owner_id: user2Id,
      title: `Other Active Requested ${nextFixtureId()}`,
      description: "Other active requested product",
      category: "Books",
      condition: "good",
      estimated_value: 1000,
      location: "Giza",
      status: "reserved",
    });
    await SwapRequest.create({
      requester: user1Id,
      receiver: user2Id,
      product_offered: offered._id,
      product_requested: otherRequested._id,
      status: "approved",
    });

    const res = await request(app)
      .patch(`/swaps/${swap._id}/cancel`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);

    const [sharedProduct, releasedProduct] = await Promise.all([
      Product.findById(offered._id),
      Product.findById(requested._id),
    ]);
    expect(sharedProduct.status).toBe("reserved");
    expect(releasedProduct.status).toBe("available");
  });

  test("Cancelled swaps block service-fee checkout and exchange setup actions", async () => {
    const { swap } = await createCancellationSwap({
      status: "cancelled",
      swapOverrides: {
        requester_paid: false,
        receiver_paid: false,
      },
    });

    const checkoutRes = await request(app)
      .post(`/swaps/${swap._id}/service-fee/checkout`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(checkoutRes.statusCode).toBe(400);
    expect(checkoutRes.body.message).toMatch(/admin approval/i);

    const exchangeRes = await request(app)
      .post(`/swaps/${swap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validMeetupPayload());

    expect(exchangeRes.statusCode).toBe(400);
    expect(exchangeRes.body.message).toMatch(/exchange setup/i);
  });

  test("Swap participants can send and read messages in oldest-first order", async () => {
    const activeSwap = await createDeliverySwap({
      status: "in_discussion",
      exchange_method: "meetup",
      delivery_details: undefined,
    });

    const requesterMessage = await request(app)
      .post(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ content: "First participant message" });

    expect(requesterMessage.statusCode).toBe(201);
    expect(requesterMessage.body.message.content).toBe("First participant message");
    expect(requesterMessage.body.message.type).toBe("text");
    expect(requesterMessage.body.message.sender._id).toBe(String(user1Id));
    expect(requesterMessage.body.message.sender.first_name).toBe("User");
    expect(requesterMessage.body.message.sender.email).toBeUndefined();
    expect(requesterMessage.body.message.sender.phone).toBeUndefined();
    expect(requesterMessage.body.message.sender.street_address).toBeUndefined();
    expect(String(requesterMessage.body.message.swap)).toBe(String(activeSwap._id));

    await new Promise((resolve) => setTimeout(resolve, 5));

    const receiverMessage = await request(app)
      .post(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${user2Token}`)
      .send({ content: "Second participant message" });

    expect(receiverMessage.statusCode).toBe(201);
    expect(receiverMessage.body.message.content).toBe("Second participant message");
    expect(receiverMessage.body.message.sender._id).toBe(String(user2Id));
    expect(receiverMessage.body.message.sender.email).toBeUndefined();
    expect(receiverMessage.body.message.sender.phone).toBeUndefined();
    expect(receiverMessage.body.message.sender.street_address).toBeUndefined();
    expect(String(receiverMessage.body.message.swap)).toBe(String(activeSwap._id));

    const otherSwap = await createDeliverySwap({
      status: "in_discussion",
      exchange_method: "meetup",
      delivery_details: undefined,
    });

    const otherSwapMessage = await request(app)
      .post(`/swaps/${otherSwap._id}/messages`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ content: "Message for another swap" });

    expect(otherSwapMessage.statusCode).toBe(201);

    const messagesRes = await request(app)
      .get(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(messagesRes.statusCode).toBe(200);
    expect(messagesRes.body.messages.map((message) => message.content)).toEqual([
      "First participant message",
      "Second participant message",
    ]);
    expect(messagesRes.body.messages.every((message) => String(message.swap) === String(activeSwap._id))).toBe(true);
    expect(messagesRes.body.messages.some((message) => message.content === "Message for another swap")).toBe(false);
    expect(messagesRes.body.messages[0].sender._id).toBe(String(user1Id));
    expect(messagesRes.body.messages[1].sender._id).toBe(String(user2Id));
    expect(messagesRes.body.messages[0].sender.email).toBeUndefined();
    expect(messagesRes.body.messages[1].sender.email).toBeUndefined();

    const storedMessages = await Message.find({ swap: activeSwap._id }).sort({ createdAt: 1 });
    expect(storedMessages).toHaveLength(2);
    expect(storedMessages.map((message) => message.content)).toEqual([
      "First participant message",
      "Second participant message",
    ]);
  });

  test("Non-participants cannot send or read swap messages", async () => {
    const outsider = await User.create({
      first_name: "Message",
      last_name: "Outsider",
      email: `message-outsider-${Date.now()}-${Math.random()}@test.com`,
      password: "hashed",
      isEmailVerified: true,
    });
    const outsiderToken = jwt.sign({ userId: outsider._id }, process.env.JWT_SECRET);
    const activeSwap = await createDeliverySwap({
      status: "in_discussion",
      exchange_method: "meetup",
      delivery_details: undefined,
    });

    const sendRes = await request(app)
      .post(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ content: "I should not be allowed here" });

    expect(sendRes.statusCode).toBe(404);
    expect(sendRes.body.message).toBe("Swap request not found");

    const readRes = await request(app)
      .get(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(readRes.statusCode).toBe(404);
    expect(readRes.body.message).toBe("Swap request not found");
    await expect(Message.findOne({
      swap: activeSwap._id,
      content: "I should not be allowed here",
    })).resolves.toBeNull();
  });

  test("Swap message validation rejects empty and over-limit content", async () => {
    const activeSwap = await createDeliverySwap({
      status: "in_discussion",
      exchange_method: "meetup",
      delivery_details: undefined,
    });

    const emptyRes = await request(app)
      .post(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ content: "   " });

    expect(emptyRes.statusCode).toBe(400);
    expect(emptyRes.body.message).toBe("Message content is required");

    const overLimitRes = await request(app)
      .post(`/swaps/${activeSwap._id}/messages`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ content: "a".repeat(1001) });

    expect(overLimitRes.statusCode).toBe(400);
    expect(overLimitRes.body.message).toBe("Message content cannot exceed 1000 characters");
    await expect(Message.countDocuments({ swap: activeSwap._id })).resolves.toBe(0);
  });

  test("Submit swap for admin review", async () => {

    const res = await request(app)
      .post(`/swaps/${swapId}/submit-review`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.status).toBe("under_review");

    const submittedSwap = await SwapRequest.findById(swapId);
    expect(submittedSwap.status).toBe("under_review");

  });

  test("Meet in person exchange setup accepts valid dataset city, area, meeting point, date, and time", async () => {
    const exchangeSwap = await createExchangeSetupSwap();

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validMeetupPayload());

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.exchange_method).toBe("meetup");
    expect(res.body.swap.meetup_details).toMatchObject({
      city: "Cairo",
      area: "Nasr City",
      meeting_point: "Citystars Mall",
      time: "10:00",
    });
  });

  test("Meet in person exchange setup accepts a valid custom location", async () => {
    const exchangeSwap = await createExchangeSetupSwap();

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validMeetupPayload({
        meeting_point: "",
        custom_location: "Coffee shop beside Citystars Gate 4",
      }));

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.meetup_details.meeting_point).toBe("Coffee shop beside Citystars Gate 4");
  });

  test.each([
    ["fake city", { city: "Atlantis" }, /city/i],
    ["area outside selected city", { area: "Dokki" }, /area/i],
    [
      "suggested meeting point outside selected area",
      { selected_meeting_point: "Tahrir Square" },
      /meeting point/i,
    ],
    [
      "missing suggested meeting point and custom location",
      { meeting_point: "", custom_location: "" },
      /meeting point or custom location/i,
    ],
    ["past date", { date: pastDateValue() }, /future date/i],
    ["time before 09:00", { time: "08:00" }, /09:00 and 18:00/i],
    ["time after 18:00", { time: "19:00" }, /09:00 and 18:00/i],
  ])("Meet in person exchange setup rejects %s", async (_case, meetupOverrides, messagePattern) => {
    const exchangeSwap = await createExchangeSetupSwap();

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validMeetupPayload(meetupOverrides));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(messagePattern);
  });

  test("Meet in person exchange setup accepts boundary times 09:00 and 18:00", async () => {
    for (const time of ["09:00", "18:00"]) {
      const exchangeSwap = await createExchangeSetupSwap();

      const res = await request(app)
        .post(`/swaps/${exchangeSwap._id}/exchange-method`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send(validMeetupPayload({ time }));

      expect(res.statusCode).toBe(200);
      expect(res.body.swap.meetup_details.time).toBe(time);
    }
  });

  test("Delivery exchange setup accepts valid Egypt city, area, pickup address, date, and time", async () => {
    const exchangeSwap = await createExchangeSetupSwap();

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validDeliveryPayload());

    expect(res.statusCode).toBe(200);
    expect(res.body.swap.exchange_method).toBe("delivery");
    expect(res.body.swap.delivery_details.requester_pickup).toMatchObject({
      address: "12 Nile Street, Building 4",
      country: "Egypt",
      city: "Giza",
      area: "Dokki",
      preferred_time: "10:00",
      submitted: true,
    });
  });

  test.each([
    ["country outside Egypt", { pickup_country: "France" }, /country/i],
    ["fake city", { pickup_city: "Atlantis" }, /city/i],
    ["area outside selected city", { pickup_area: "Nasr City" }, /area/i],
    ["missing pickup address", { pickup_address: "" }, /address/i],
    ["past pickup date", { preferred_pickup_date: pastDateValue() }, /future date/i],
    ["pickup time before 09:00", { preferred_pickup_time: "08:00" }, /09:00 and 18:00/i],
    ["pickup time after 18:00", { preferred_pickup_time: "19:00" }, /09:00 and 18:00/i],
  ])("Delivery exchange setup rejects %s", async (_case, deliveryOverrides, messagePattern) => {
    const exchangeSwap = await createExchangeSetupSwap();

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validDeliveryPayload(deliveryOverrides));

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(messagePattern);
  });

  test("Delivery exchange setup accepts boundary times 09:00 and 18:00", async () => {
    for (const time of ["09:00", "18:00"]) {
      const exchangeSwap = await createExchangeSetupSwap();

      const res = await request(app)
        .post(`/swaps/${exchangeSwap._id}/exchange-method`)
        .set("Authorization", `Bearer ${user1Token}`)
        .send(validDeliveryPayload({ preferred_pickup_time: time }));

      expect(res.statusCode).toBe(200);
      expect(res.body.swap.delivery_details.requester_pickup.preferred_time).toBe(time);
    }
  });

  test("Non-participant cannot submit exchange setup details", async () => {
    const exchangeSwap = await createExchangeSetupSwap();
    const outsider = await User.create({
      first_name: "Outside",
      last_name: "User",
      email: `outside-${nextFixtureId()}@test.com`,
      password: "hashed",
      isEmailVerified: true,
    });
    const outsiderToken = jwt.sign({ userId: outsider._id }, process.env.JWT_SECRET);

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send(validMeetupPayload());

    expect(res.statusCode).toBe(404);
  });

  test("Exchange setup cannot be submitted before both service fees are paid", async () => {
    const exchangeSwap = await createExchangeSetupSwap({ requester_paid: false });

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validMeetupPayload());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/service fees/i);
  });

  test("Exchange setup cannot be submitted before the exchange_setup status", async () => {
    const exchangeSwap = await createExchangeSetupSwap({ status: "approved" });

    const res = await request(app)
      .post(`/swaps/${exchangeSwap._id}/exchange-method`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send(validMeetupPayload());

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/exchange setup/i);
  });

  test("Delivery swap cannot be confirmed before delivery completion", async () => {
    await User.findByIdAndUpdate(user1Id, { $set: { held_coins: 10 } });

    const deliverySwap = await createDeliverySwap({
      compensation_amount: 10,
      compensation_payer: user1Id,
      compensation_receiver: user2Id,
      compensation_status: "held",
    });

    const res = await request(app)
      .patch(`/swaps/${deliverySwap._id}/confirm-completion`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/Delivery must be completed/i);

    const unchangedSwap = await SwapRequest.findById(deliverySwap._id);
    const payer = await User.findById(user1Id);

    expect(unchangedSwap.status).toBe("in_progress");
    expect(unchangedSwap.compensation_status).toBe("held");
    expect(payer.held_coins).toBe(10);
  });

  test("Admin delivery tracking reaches completed before compensation release", async () => {
    await User.findByIdAndUpdate(user1Id, { $set: { coins: 40, held_coins: 10 } });
    await User.findByIdAndUpdate(user2Id, { $set: { coins: 50, held_coins: 0 } });

    const deliverySwap = await createDeliverySwap({
      compensation_amount: 10,
      compensation_payer: user1Id,
      compensation_receiver: user2Id,
      compensation_status: "held",
    });

    const actions = [
      ["mark_requester_picked_up", "picked_up"],
      ["mark_receiver_picked_up", "in_transit"],
      ["mark_delivered_to_requester", "delivered_to_receiver"],
      ["mark_delivered_to_receiver", "delivery_completed"],
    ];

    for (const [action, expectedStatus] of actions) {
      const res = await request(app)
        .patch(`/admin/swaps/${deliverySwap._id}/delivery-tracking`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ action });

      expect(res.statusCode).toBe(200);
      expect(res.body.swap.delivery_details.delivery_status).toBe(expectedStatus);
    }

    const firstConfirm = await request(app)
      .patch(`/swaps/${deliverySwap._id}/confirm-completion`)
      .set("Authorization", `Bearer ${user1Token}`);

    expect(firstConfirm.statusCode).toBe(200);
    expect(firstConfirm.body.swap.status).toBe("in_progress");

    let payer = await User.findById(user1Id);
    let receiver = await User.findById(user2Id);
    expect(payer.held_coins).toBe(10);
    expect(receiver.coins).toBe(50);

    const secondConfirm = await request(app)
      .patch(`/swaps/${deliverySwap._id}/confirm-completion`)
      .set("Authorization", `Bearer ${user2Token}`);

    expect(secondConfirm.statusCode).toBe(200);
    expect(secondConfirm.body.swap.status).toBe("completed");

    const completedSwap = await SwapRequest.findById(deliverySwap._id);
    payer = await User.findById(user1Id);
    receiver = await User.findById(user2Id);

    expect(completedSwap.compensation_status).toBe("released");
    expect(payer.held_coins).toBe(0);
    expect(receiver.coins).toBe(65);
  });

  test("Opening a swap dispute freezes an active delivery swap", async () => {
    await User.findByIdAndUpdate(user1Id, { $set: { coins: 40, held_coins: 10 } });

    const deliverySwap = await createDeliverySwap({
      compensation_amount: 10,
      compensation_payer: user1Id,
      compensation_receiver: user2Id,
      compensation_status: "held",
    });

    const res = await request(app)
      .post(`/swaps/${deliverySwap._id}/reports`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        target_type: "swap",
        reason: "Item not received",
        description: "Delivery is blocked and I need admin help.",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.swap.status).toBe("disputed");
    expect(res.body.report.previous_swap_status).toBe("in_progress");

    const disputedSwap = await SwapRequest.findById(deliverySwap._id);
    const offered = await Product.findById(disputedSwap.product_offered);
    const requested = await Product.findById(disputedSwap.product_requested);
    const payer = await User.findById(user1Id);
    const adminNotification = await Notification.findOne({
      type: "system",
      title: "New swap dispute",
      related_swap: deliverySwap._id,
    });

    expect(disputedSwap.status).toBe("disputed");
    expect(disputedSwap.compensation_status).toBe("held");
    expect(offered.status).toBe("reserved");
    expect(requested.status).toBe("reserved");
    expect(payer.held_coins).toBe(10);
    expect(adminNotification).toBeTruthy();

    const duplicate = await request(app)
      .post(`/swaps/${deliverySwap._id}/reports`)
      .set("Authorization", `Bearer ${user2Token}`)
      .send({
        target_type: "swap",
        reason: "Duplicate dispute",
        description: "This should not open twice.",
      });

    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.body.message).toMatch(/active dispute/i);
  });

  test("Message reports do not dispute the swap", async () => {
    const activeSwap = await createDeliverySwap({
      status: "in_discussion",
      exchange_method: "meetup",
      delivery_details: undefined,
    });
    const message = await Message.create({
      swap: activeSwap._id,
      sender: user2Id,
      content: "Suspicious message",
      read_by: [user2Id],
    });

    const res = await request(app)
      .post(`/swaps/${activeSwap._id}/reports`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        target_type: "message",
        target_id: message._id,
        reason: "Harassment",
        description: "This message needs review.",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.swap.status).toBe("in_discussion");

    const unchangedSwap = await SwapRequest.findById(activeSwap._id);
    const reportedMessage = await Message.findById(message._id);

    expect(unchangedSwap.status).toBe("in_discussion");
    expect(reportedMessage.is_reported).toBe(true);
    expect(reportedMessage.report_reason).toBe("Harassment");
  });

  test("Admin can continue a disputed swap once with notes", async () => {
    const activeSwap = await createDeliverySwap({
      status: "approved",
      exchange_method: "meetup",
      delivery_details: undefined,
    });

    const disputeRes = await request(app)
      .post(`/swaps/${activeSwap._id}/reports`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        target_type: "swap",
        reason: "Needs review",
        description: "Admin should decide if this can continue.",
      });

    expect(disputeRes.statusCode).toBe(201);

    const withoutNotes = await request(app)
      .patch(`/admin/reports/${disputeRes.body.report.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ resolution_action: "continue_swap" });

    expect(withoutNotes.statusCode).toBe(400);
    expect(withoutNotes.body.message).toMatch(/admin notes/i);

    const continued = await request(app)
      .patch(`/admin/reports/${disputeRes.body.report.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        resolution_action: "continue_swap",
        admin_notes: "No policy violation found.",
      });

    expect(continued.statusCode).toBe(200);
    expect(continued.body.report.status).toBe("resolved");
    expect(continued.body.report.resolution_action).toBe("continue_swap");

    const restoredSwap = await SwapRequest.findById(activeSwap._id);
    expect(restoredSwap.status).toBe("approved");

    const secondResolution = await request(app)
      .patch(`/admin/reports/${disputeRes.body.report.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ resolution_action: "dismiss" });

    expect(secondResolution.statusCode).toBe(400);
    expect(secondResolution.body.message).toMatch(/already been resolved/i);
  });

  test("Admin cancel resolution refunds held compensation, cancels delivery, and releases products", async () => {
    await User.findByIdAndUpdate(user1Id, { $set: { coins: 40, held_coins: 10 } });

    const deliverySwap = await createDeliverySwap({
      compensation_amount: 10,
      compensation_payer: user1Id,
      compensation_receiver: user2Id,
      compensation_status: "held",
    });

    const disputeRes = await request(app)
      .post(`/swaps/${deliverySwap._id}/reports`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        target_type: "swap",
        reason: "Delivery issue",
        description: "Delivery should be cancelled.",
      });

    const cancelled = await request(app)
      .patch(`/admin/reports/${disputeRes.body.report.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        resolution_action: "cancel_swap",
        admin_notes: "Delivery could not be completed safely.",
      });

    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.body.report.status).toBe("resolved");
    expect(cancelled.body.report.resolution_action).toBe("cancel_swap");

    const cancelledSwap = await SwapRequest.findById(deliverySwap._id);
    const offered = await Product.findById(cancelledSwap.product_offered);
    const requested = await Product.findById(cancelledSwap.product_requested);
    const payer = await User.findById(user1Id);

    expect(cancelledSwap.status).toBe("cancelled");
    expect(cancelledSwap.compensation_status).toBe("refunded");
    expect(offered.status).toBe("available");
    expect(requested.status).toBe("available");
    expect(payer.coins).toBe(50);
    expect(payer.held_coins).toBe(0);
  });

  test("Ratings require completed swaps and prevent duplicates", async () => {
    const res = await request(app)
      .post(`/swaps/${swapId}/ratings`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ score: 5 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/completed/i);

    await User.findByIdAndUpdate(user2Id, {
      $set: {
        rating: 0,
        rating_count: 0,
        "notification_preferences.new_ratings_enabled": false,
      },
    });

    const completedSwap = await createCompletedSwap();

    const ratingRes = await request(app)
      .post(`/swaps/${completedSwap._id}/ratings`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({
        score: 5,
        tags: ["friendly", "item-as-described"],
        comment: "Excellent swap.",
      });

    expect(ratingRes.statusCode).toBe(201);
    expect(ratingRes.body.rating.score).toBe(5);
    expect(ratingRes.body.rated_user.rating).toBe(5);
    expect(ratingRes.body.rated_user.rating_count).toBe(1);

    const ratedUser = await User.findById(user2Id);
    expect(ratedUser.rating).toBe(5);
    expect(ratedUser.rating_count).toBe(1);

    const suppressedNotification = await Notification.findOne({
      user: user2Id,
      type: "rating",
      related_swap: completedSwap._id,
    });
    expect(suppressedNotification).toBeNull();

    const duplicateRes = await request(app)
      .post(`/swaps/${completedSwap._id}/ratings`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ score: 4 });

    expect(duplicateRes.statusCode).toBe(400);
    expect(duplicateRes.body.message).toMatch(/already rated/i);
  });

  test("Users cannot rate themselves", async () => {
    const selfSwap = await createCompletedSwap({ requester: user1Id, receiver: user1Id });

    const res = await request(app)
      .post(`/swaps/${selfSwap._id}/ratings`)
      .set("Authorization", `Bearer ${user1Token}`)
      .send({ score: 5 });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot rate yourself/i);

    const rating = await Rating.findOne({ swap: selfSwap._id });
    expect(rating).toBeNull();
  });

});
