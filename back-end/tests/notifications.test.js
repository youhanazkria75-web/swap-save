process.env.JWT_SECRET = "test_jwt_secret";

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const Notification = require("../src/models/Notification");
const SwapRequest = require("../src/models/SwapRequest");
const User = require("../src/models/User");
const { createNotification, notifyAdmins } = require("../src/utils/notifications");

let mongoServer;
let user;
let token;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

beforeEach(async () => {
  await Promise.all([
    Notification.deleteMany({}),
    SwapRequest.deleteMany({}),
    User.deleteMany({}),
  ]);

  user = await User.create({
    first_name: "Notify",
    last_name: "User",
    email: "notify-user@test.com",
    password: "hashed",
    isEmailVerified: true,
  });
  token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Notifications API", () => {
  test("returns serialized notifications with unread count and target metadata", async () => {
    const swapId = new mongoose.Types.ObjectId();

    await Notification.create([
      {
        user: user._id,
        type: "message",
        title: "New message",
        body: "A swap message arrived.",
        related_swap: swapId,
        target_type: "swap",
        target_id: swapId,
        target_url: `/user/swaps/${swapId}`,
      },
      {
        user: user._id,
        type: "system",
        title: "Already read",
        body: "This was read.",
        is_read: true,
      },
    ]);

    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.unread_count).toBe(1);
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications[0]).toEqual(
      expect.objectContaining({
        recipient: expect.any(String),
        type: expect.any(String),
        title: expect.any(String),
        message: expect.any(String),
        is_read: expect.any(Boolean),
        target_type: expect.any(String),
        target_url: expect.any(String),
        createdAt: expect.any(String),
      })
    );
  });

  test("does not expose populated swap details in notification responses", async () => {
    const otherUser = await User.create({
      first_name: "Other",
      last_name: "User",
      email: "other-notify@test.com",
      password: "hashed",
      isEmailVerified: true,
    });
    const swap = await SwapRequest.create({
      requester: user._id,
      receiver: otherUser._id,
      product_offered: new mongoose.Types.ObjectId(),
      product_requested: new mongoose.Types.ObjectId(),
      status: "in_progress",
      admin_notes: "private admin note",
      delivery_details: {
        requester_pickup: {
          address: "Private requester address",
          submitted: true,
        },
        receiver_pickup: {
          address: "Private receiver address",
          submitted: true,
        },
      },
    });

    await Notification.create({
      user: user._id,
      type: "delivery",
      title: "Delivery update",
      body: "Tracking changed.",
      related_swap: swap._id,
    });

    const res = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.notifications[0].related_swap).toBe(String(swap._id));
    expect(JSON.stringify(res.body.notifications[0])).not.toContain("private admin note");
    expect(JSON.stringify(res.body.notifications[0])).not.toContain("Private requester address");
    expect(JSON.stringify(res.body.notifications[0])).not.toContain("Private receiver address");
  });

  test("reads one notification and all notifications with updated unread counts", async () => {
    const notifications = await Notification.create([
      {
        user: user._id,
        type: "system",
        title: "First",
        body: "First body",
      },
      {
        user: user._id,
        type: "system",
        title: "Second",
        body: "Second body",
      },
    ]);

    const countRes = await request(app)
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`);

    expect(countRes.statusCode).toBe(200);
    expect(countRes.body.unread_count).toBe(2);

    const readOneRes = await request(app)
      .patch(`/notifications/${notifications[0]._id}/read`)
      .set("Authorization", `Bearer ${token}`);

    expect(readOneRes.statusCode).toBe(200);
    expect(readOneRes.body.notification.is_read).toBe(true);
    expect(readOneRes.body.unread_count).toBe(1);

    const afterReadOneRes = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${token}`);
    const persistedReadNotification = afterReadOneRes.body.notifications.find(
      (notification) => notification.id === String(notifications[0]._id)
    );

    expect(afterReadOneRes.statusCode).toBe(200);
    expect(afterReadOneRes.body.unread_count).toBe(1);
    expect(persistedReadNotification.is_read).toBe(true);

    const readAllRes = await request(app)
      .patch("/notifications/read-all")
      .set("Authorization", `Bearer ${token}`);

    expect(readAllRes.statusCode).toBe(200);
    expect(readAllRes.body.unread_count).toBe(0);
    expect(readAllRes.body.modified_count).toBe(1);

    const afterReadAllCountRes = await request(app)
      .get("/notifications/unread-count")
      .set("Authorization", `Bearer ${token}`);
    const afterReadAllRes = await request(app)
      .get("/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(afterReadAllCountRes.statusCode).toBe(200);
    expect(afterReadAllCountRes.body.unread_count).toBe(0);
    expect(afterReadAllRes.body.notifications.every((notification) => notification.is_read)).toBe(true);
  });

  test("respects message preferences while wallet notifications bypass preferences", async () => {
    await User.updateOne(
      { _id: user._id },
      { $set: { "notification_preferences.new_messages_enabled": false } }
    );

    const skipped = await createNotification({
      user: user._id,
      type: "message",
      title: "Muted message",
      body: "This should respect message preferences.",
      related_swap: new mongoose.Types.ObjectId(),
    });
    const walletNotification = await createNotification({
      user: user._id,
      type: "payment",
      title: "Coins credited",
      body: "10 coins credited.",
      target_type: "wallet",
      bypass_preferences: true,
    });

    expect(skipped).toBeNull();
    expect(walletNotification).toBeDefined();

    const savedNotifications = await Notification.find({ user: user._id });
    expect(savedNotifications).toHaveLength(1);
    expect(savedNotifications[0].target_url).toBe("/user/coins");
  });

  test("defaults admin swap notifications to admin swap targets", async () => {
    const admin = await User.create({
      first_name: "Notify",
      last_name: "Admin",
      email: "notify-admin@test.com",
      password: "hashed",
      role: "admin",
      isEmailVerified: true,
    });
    const swapId = new mongoose.Types.ObjectId();

    await notifyAdmins({
      type: "system",
      title: "Swap dispute",
      body: "A dispute needs review.",
      related_swap: swapId,
    });

    const adminNotification = await Notification.findOne({ user: admin._id });

    expect(adminNotification).toBeDefined();
    expect(adminNotification.target_url).toBe(`/admin/swaps/${swapId}`);
    expect(adminNotification.target_type).toBe("swap");
  });
});
