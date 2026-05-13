process.env.JWT_SECRET = "test_jwt_secret";

jest.mock("cloudinary", () => ({
  v2: {
    uploader: {
      upload: jest.fn(),
    },
  },
}));

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { v2: cloudinary } = require("cloudinary");

const app = require("../src/app");
const Notification = require("../src/models/Notification");
const Product = require("../src/models/Product");
const ProductView = require("../src/models/ProductView");
const Rating = require("../src/models/Rating");
const Report = require("../src/models/Report");
const SwapRequest = require("../src/models/SwapRequest");
const User = require("../src/models/User");

let mongoServer;
let token;
let reporterToken;
let ownerId;
let createdProductId;
let raterId;
let adminId;
let originalCloudinaryUrl;

const tinyJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0,
  0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01,
  0xff, 0xd9,
]);

const validProductPayload = (overrides = {}) => ({
  title: "Mirrorless Camera",
  description: "A detailed product description for a real listing.",
  category: "Electronics",
  subcategory: "Cameras",
  condition: "good",
  estimated_value: 9000,
  location: "Cairo",
  images: ["/uploads/products/test-product.jpg"],
  tags: ["camera"],
  ...overrides,
});

const expectValidationErrorFor = (res, field) => {
  expect(res.statusCode).toBe(400);
  expect(res.body.message).toBe("Validation failed");
  expect(res.body.errors.some((error) => (error.path || error.param) === field)).toBe(true);
};

const createProductForDelete = (overrides = {}) =>
  Product.create(validProductPayload({
    owner_id: ownerId,
    title: `Delete lifecycle product ${Date.now()}-${Math.random()}`,
    ...overrides,
  }));

const createLinkedSwapForProduct = async (product, status) => {
  const requestedProduct = await Product.create(validProductPayload({
    owner_id: raterId,
    title: `Delete lifecycle requested ${Date.now()}-${Math.random()}`,
  }));

  return SwapRequest.create({
    requester: ownerId,
    receiver: raterId,
    product_offered: product._id,
    product_requested: requestedProduct._id,
    status,
    requester_paid: ["exchange_setup", "in_progress", "completed"].includes(status),
    receiver_paid: ["exchange_setup", "in_progress", "completed"].includes(status),
    requester_confirmed: status === "completed",
    receiver_confirmed: status === "completed",
    completed_at: status === "completed" ? new Date() : undefined,
  });
};

beforeAll(async () => {
  originalCloudinaryUrl = process.env.CLOUDINARY_URL;
  delete process.env.CLOUDINARY_URL;

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await ProductView.init();

  const user = await User.create({
    first_name: "Product",
    last_name: "Tester",
    email: "product@test.com",
    password: "hashed",
    isEmailVerified: true,
  });
  const rater = await User.create({
    first_name: "Product",
    last_name: "Rater",
    email: "product-rater@test.com",
    password: "hashed",
    isEmailVerified: true,
  });
  const admin = await User.create({
    first_name: "Product",
    last_name: "Admin",
    email: "product-admin@test.com",
    password: "hashed",
    role: "admin",
    isEmailVerified: true,
  });

  ownerId = user._id;
  raterId = rater._id;
  adminId = admin._id;
  token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  reporterToken = jwt.sign({ userId: rater._id }, process.env.JWT_SECRET);
});

beforeEach(() => {
  delete process.env.CLOUDINARY_URL;
  cloudinary.uploader.upload.mockReset();
});

afterAll(async () => {
  if (originalCloudinaryUrl === undefined) {
    delete process.env.CLOUDINARY_URL;
  } else {
    process.env.CLOUDINARY_URL = originalCloudinaryUrl;
  }

  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("Products API", () => {
  test("Upload product images", async () => {
    const res = await request(app)
      .post("/products/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", tinyJpeg, "photo.jpg");

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.images)).toBe(true);
    expect(res.body.images.length).toBe(1);
    expect(res.body.images[0]).toContain("/uploads/products/");
  });

  test("Upload product images stores Cloudinary secure URLs when configured", async () => {
    const cloudinaryUrl = "https://res.cloudinary.com/swap-save/image/upload/v1/products/photo.jpg";
    process.env.CLOUDINARY_URL = "cloudinary://api-key:api-secret@swap-save";
    cloudinary.uploader.upload.mockResolvedValueOnce({
      secure_url: cloudinaryUrl,
      public_id: "swap-save/products/photo",
    });

    const uploadRes = await request(app)
      .post("/products/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", tinyJpeg, "cloudinary-photo.jpg");

    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.body.images).toEqual([cloudinaryUrl]);
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        folder: "swap-save/products",
        resource_type: "image",
        secure: true,
      })
    );

    const createRes = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({
        title: "Cloudinary Camera",
        description: "Camera listing with a Cloudinary-hosted image.",
        images: uploadRes.body.images,
      }));

    expect(createRes.statusCode).toBe(201);

    const storedProduct = await Product.findById(createRes.body.product._id);
    expect(storedProduct.images).toEqual([cloudinaryUrl]);
  });

  test("Avatar upload stores Cloudinary secure URL when configured", async () => {
    const cloudinaryUrl = "https://res.cloudinary.com/swap-save/image/upload/v1/avatars/avatar.jpg";
    process.env.CLOUDINARY_URL = "cloudinary://api-key:api-secret@swap-save";
    cloudinary.uploader.upload.mockResolvedValueOnce({
      secure_url: cloudinaryUrl,
      public_id: "swap-save/avatars/avatar",
    });

    const res = await request(app)
      .post("/users/me/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("avatar", tinyJpeg, "avatar.jpg");

    expect(res.statusCode).toBe(200);
    expect(res.body.user.avatar).toBe(cloudinaryUrl);
    expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        folder: "swap-save/avatars",
        resource_type: "image",
        secure: true,
      })
    );

    const user = await User.findById(ownerId);
    expect(user.avatar).toBe(cloudinaryUrl);
  });

  test("Reject spoofed product image uploads", async () => {
    const res = await request(app)
      .post("/products/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", Buffer.from("fake image"), "spoofed.jpg");

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Invalid image file content");
  });

  test("Create product rejects missing title", async () => {
    const { title, ...payload } = validProductPayload();

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expectValidationErrorFor(res, "title");
  });

  test("Create product rejects too-short title", async () => {
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ title: "A" }));

    expectValidationErrorFor(res, "title");
  });

  test("Create product rejects missing or too-short description", async () => {
    const { description, ...missingDescriptionPayload } = validProductPayload();

    const missing = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(missingDescriptionPayload);
    expectValidationErrorFor(missing, "description");

    const tooShort = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ description: "Too short" }));
    expectValidationErrorFor(tooShort, "description");
  });

  test("Create product rejects missing category", async () => {
    const { category, ...payload } = validProductPayload();

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expectValidationErrorFor(res, "category");
  });

  test("Create product rejects invalid category", async () => {
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ category: "Random Category" }));

    expectValidationErrorFor(res, "category");
  });

  test("Create product rejects missing condition", async () => {
    const { condition, ...payload } = validProductPayload();

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expectValidationErrorFor(res, "condition");
  });

  test("Create product rejects invalid condition", async () => {
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ condition: "Used" }));

    expectValidationErrorFor(res, "condition");
  });

  test("Create product rejects missing estimated value", async () => {
    const { estimated_value, ...payload } = validProductPayload();

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expectValidationErrorFor(res, "estimated_value");
  });

  test("Create product rejects zero or negative estimated value", async () => {
    const zero = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ estimated_value: 0 }));
    expectValidationErrorFor(zero, "estimated_value");

    const negative = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ estimated_value: -1 }));
    expectValidationErrorFor(negative, "estimated_value");
  });

  test("Create product rejects missing images", async () => {
    const { images, ...payload } = validProductPayload();

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expectValidationErrorFor(res, "images");
  });

  test("Create product rejects malformed images array", async () => {
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({ images: [""] }));

    expectValidationErrorFor(res, "images");
  });

  test("Create new product", async () => {
    const uploadRes = await request(app)
      .post("/products/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("images", tinyJpeg, "create-product.jpg");

    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "iPhone 11",
        description: "Good condition",
        category: "Electronics",
        condition: "good",
        estimated_value: 9000,
        location: "Cairo",
        images: uploadRes.body.images,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.product).toBeDefined();
    expect(res.body.product.title).toBe("iPhone 11");
    expect(res.body.product.images).toEqual(uploadRes.body.images);
    createdProductId = res.body.product._id;
  });

  test("Create product accepts current frontend payload shape", async () => {
    const res = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validProductPayload({
        title: "Desk Speaker",
        description: "Compact desk speaker with clean sound.",
        category: "Electronics",
        subcategory: "Audio",
        condition: "like-new",
        estimated_value: 1200,
        location: "Giza",
        images: ["/uploads/products/frontend-shape.jpg"],
        tags: ["audio", "desk"],
      }));

    expect(res.statusCode).toBe(201);
    expect(res.body.product.owner_id).toBe(String(ownerId));
    expect(res.body.product.condition).toBe("like-new");
    expect(res.body.product.images).toEqual(["/uploads/products/frontend-shape.jpg"]);
  });

  test("Update product rejects invalid category", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "Invalid Category" });

    expectValidationErrorFor(res, "category");
  });

  test("Update product rejects invalid condition", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ condition: "Used" });

    expectValidationErrorFor(res, "condition");
  });

  test("Update product rejects negative estimated value", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ estimated_value: -100 });

    expectValidationErrorFor(res, "estimated_value");
  });

  test("Update product rejects too-short description when provided", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ description: "short" });

    expectValidationErrorFor(res, "description");
  });

  test("Update product rejects removing all images", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ images: [] });

    expectValidationErrorFor(res, "images");
  });

  test("Update product accepts valid partial update", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated Speaker" });

    expect(res.statusCode).toBe(200);
    expect(res.body.product.title).toBe("Updated Speaker");
    expect(res.body.product.description).toBe(product.description);
  });

  test("Update product accepts current frontend edit payload shape", async () => {
    const product = await Product.create(validProductPayload({ owner_id: ownerId }));
    const payload = validProductPayload({
      title: "Edited Camera Kit",
      description: "Edited camera kit with lens and accessories.",
      category: "Art & Collectibles",
      subcategory: "Cameras",
      condition: "fair",
      estimated_value: 4500,
      location: "Alexandria",
      images: ["/uploads/products/edited-camera.jpg"],
      tags: ["edited", "camera"],
    });

    const res = await request(app)
      .put(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.product.title).toBe(payload.title);
    expect(res.body.product.category).toBe(payload.category);
    expect(res.body.product.condition).toBe(payload.condition);
    expect(res.body.product.estimated_value).toBe(payload.estimated_value);
    expect(res.body.product.images).toEqual(payload.images);
  });

  test("Public product owner rating is sourced from rating records", async () => {
    await Rating.create({
      swap: new mongoose.Types.ObjectId(),
      rater: raterId,
      rated_user: ownerId,
      score: 4,
      tags: ["friendly"],
      comment: "Good owner.",
    });

    const res = await request(app).get(`/products/${createdProductId}/public`);

    expect(res.statusCode).toBe(200);
    expect(res.body.owner.rating).toBe(4);
    expect(res.body.owner.rating_count).toBe(1);
  });

  test("Admin-owned public product detail opens with safe owner fields", async () => {
    await User.updateOne(
      { _id: adminId },
      {
        $set: {
          phone: "+201001234567",
          street_address: "15 Abbas El Akkad",
        },
      }
    );

    const adminProduct = await Product.create(validProductPayload({
      owner_id: adminId,
      title: `Admin owned public product ${Date.now()}-${Math.random()}`,
      status: "available",
    }));

    expect(String(adminProduct.owner_id)).toBe(String(adminId));

    const res = await request(app).get(`/products/${adminProduct._id}/public`);

    expect(res.statusCode).toBe(200);
    expect(res.body.product._id).toBe(String(adminProduct._id));
    expect(res.body.owner._id).toBe(String(adminId));
    expect(res.body.owner.first_name).toBe("Product");
    expect(res.body.owner.last_name).toBe("Admin");
    expect(res.body.owner.trust_score).toEqual(expect.any(Number));
    expect(res.body.owner.completed_swaps).toEqual(expect.any(Number));
    expect(res.body.owner.rating).toEqual(expect.any(Number));
    expect(res.body.owner.rating_count).toEqual(expect.any(Number));
    expect(res.body.owner.email).toBeUndefined();
    expect(res.body.owner.phone).toBeUndefined();
    expect(res.body.owner.street_address).toBeUndefined();
    expect(res.body.owner.saved_products).toBeUndefined();
    expect(res.body.owner.role).toBeUndefined();
    expect(res.body.owner.is_deleted).toBeUndefined();
  });

  test.each(["inactive", "rejected", "reserved"])(
    "Public product detail still hides %s products",
    async (status) => {
      const product = await Product.create(validProductPayload({
        owner_id: ownerId,
        title: `Hidden public detail product ${status} ${Date.now()}-${Math.random()}`,
        status,
      }));

      const res = await request(app).get(`/products/${product._id}/public`);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe("Product not found");
    }
  );

  test("Public product detail still hides products owned by deleted users", async () => {
    const deletedOwner = await User.create({
      first_name: "Deleted",
      last_name: "Owner",
      email: `deleted-owner-${Date.now()}-${Math.random()}@test.com`,
      password: "hashed",
      isEmailVerified: true,
      is_deleted: true,
    });
    const product = await Product.create(validProductPayload({
      owner_id: deletedOwner._id,
      title: `Deleted owner public product ${Date.now()}-${Math.random()}`,
      status: "available",
    }));

    const res = await request(app).get(`/products/${product._id}/public`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("Owner not found");
  });

  test("Product view endpoint counts unique logged-in and guest viewers", async () => {
    const unique = `${Date.now()}-${Math.random()}`;
    const product = await Product.create(validProductPayload({
      owner_id: ownerId,
      title: `View counted product ${unique}`,
      status: "available",
      view_count: 0,
    }));

    const ownerView = await request(app)
      .post(`/products/${product._id}/view`)
      .set("Authorization", `Bearer ${token}`);

    expect(ownerView.statusCode).toBe(200);
    expect(ownerView.body.counted).toBe(false);
    expect(ownerView.body.view_count).toBe(0);
    await expect(ProductView.countDocuments({ product_id: product._id })).resolves.toBe(0);

    const firstLoggedInView = await request(app)
      .post(`/products/${product._id}/view`)
      .set("Authorization", `Bearer ${reporterToken}`);

    expect(firstLoggedInView.statusCode).toBe(200);
    expect(firstLoggedInView.body.counted).toBe(true);
    expect(firstLoggedInView.body.view_count).toBe(1);

    const duplicateLoggedInView = await request(app)
      .post(`/products/${product._id}/view`)
      .set("Authorization", `Bearer ${reporterToken}`);

    expect(duplicateLoggedInView.statusCode).toBe(200);
    expect(duplicateLoggedInView.body.counted).toBe(false);
    expect(duplicateLoggedInView.body.view_count).toBe(1);
    await expect(ProductView.countDocuments({
      product_id: product._id,
      viewer_user_id: raterId,
    })).resolves.toBe(1);

    const guestSessionId = `guest-session-${unique}`;
    const firstGuestView = await request(app)
      .post(`/products/${product._id}/view`)
      .set("x-view-session-id", guestSessionId);

    expect(firstGuestView.statusCode).toBe(200);
    expect(firstGuestView.body.counted).toBe(true);
    expect(firstGuestView.body.view_count).toBe(2);

    const duplicateGuestView = await request(app)
      .post(`/products/${product._id}/view`)
      .set("x-view-session-id", guestSessionId);

    expect(duplicateGuestView.statusCode).toBe(200);
    expect(duplicateGuestView.body.counted).toBe(false);
    expect(duplicateGuestView.body.view_count).toBe(2);

    const differentGuestView = await request(app)
      .post(`/products/${product._id}/view`)
      .set("x-view-session-id", `${guestSessionId}-other`);

    expect(differentGuestView.statusCode).toBe(200);
    expect(differentGuestView.body.counted).toBe(true);
    expect(differentGuestView.body.view_count).toBe(3);

    const detail = await request(app).get(`/products/${product._id}/public`);
    expect(detail.statusCode).toBe(200);
    expect(detail.body.product.view_count).toBe(3);

    const listing = await request(app)
      .get("/products")
      .query({ q: product.title, status: "available", limit: 20 });

    expect(listing.statusCode).toBe(200);
    expect(listing.body.products).toHaveLength(1);
    expect(listing.body.products[0]._id).toBe(String(product._id));
    expect(listing.body.products[0].view_count).toBe(3);

    const storedProduct = await Product.findById(product._id);
    expect(storedProduct.view_count).toBe(3);
    await expect(ProductView.countDocuments({ product_id: product._id })).resolves.toBe(3);
  });

  test("Authenticated users can create real product reports", async () => {
    const res = await request(app)
      .post(`/products/${createdProductId}/reports`)
      .set("Authorization", `Bearer ${reporterToken}`)
      .send({
        reason: "Inaccurate listing",
        description: "The listing appears misleading.",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.report.target_type).toBe("product");
    expect(res.body.report.status).toBe("open");

    const report = await Report.findOne({
      reporter: raterId,
      target_type: "product",
      target_id: createdProductId,
    });
    expect(report).toBeTruthy();

    const adminNotification = await Notification.findOne({
      user: adminId,
      type: "report",
      title: "New product report",
    });
    expect(adminNotification).toBeTruthy();
    expect(adminNotification.target_url).toBe("/admin/reports");
  });

  test("Get all available products", async () => {
    const res = await request(app).get("/products");

    expect(res.statusCode).toBe(200);
    expect(res.body.products).toBeDefined();
    expect(Array.isArray(res.body.products)).toBe(true);
  });

  test("Marketplace listing applies backend search, filters, sorting, and public statuses", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const featuredLamp = await Product.create({
      owner_id: ownerId,
      title: "Vintage Lamp Stand",
      description: "Ceramic table lighting",
      category: "Home & Garden",
      condition: "fair",
      estimated_value: 450,
      location: "Giza",
      tags: ["decor", "lighting"],
      status: "available",
      is_featured: true,
      featured_until: future,
      view_count: 7,
    });

    await Product.create({
      owner_id: raterId,
      title: "Road Bike Sold",
      description: "Completed cycling swap",
      category: "Sports & Outdoors",
      condition: "good",
      estimated_value: 1500,
      location: "Cairo",
      tags: ["cycling"],
      status: "swapped",
      view_count: 20,
    });

    await Product.create({
      owner_id: raterId,
      title: "Reserved lighting result",
      description: "Should not appear publicly",
      category: "Home & Garden",
      condition: "fair",
      estimated_value: 450,
      location: "Giza",
      tags: ["lighting"],
      status: "reserved",
    });

    const filtered = await request(app)
      .get("/products")
      .query({
        status: "all",
        q: "decor",
        category: "Home & Garden",
        condition: "fair",
        min_value: 400,
        max_value: 500,
        location: "giz",
        featured: "true",
        limit: 20,
      });

    expect(filtered.statusCode).toBe(200);
    expect(filtered.body.products).toHaveLength(1);
    expect(String(filtered.body.products[0]._id)).toBe(String(featuredLamp._id));

    const swappedSearch = await request(app)
      .get("/products")
      .query({ status: "all", q: "cycling", sort: "popular", limit: 20 });

    expect(swappedSearch.statusCode).toBe(200);
    expect(swappedSearch.body.products.map((product) => product.status)).toEqual(["swapped"]);

    const availableOnly = await request(app)
      .get("/products")
      .query({ status: "available", q: "cycling", limit: 20 });

    expect(availableOnly.statusCode).toBe(200);
    expect(availableOnly.body.products).toHaveLength(0);
  });

  test("Get my products", async () => {
    const res = await request(app)
      .get("/products/mine")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  test("Owner can delete product with no swaps", async () => {
    const product = await createProductForDelete();

    const res = await request(app)
      .delete(`/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
    await expect(Product.findById(product._id)).resolves.toBeNull();
  });

  test("Non-owner cannot delete product", async () => {
    const product = await createProductForDelete();

    const res = await request(app)
      .delete(`/products/${product._id}`)
      .set("Authorization", `Bearer ${reporterToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Not allowed");
    await expect(Product.findById(product._id)).resolves.toBeTruthy();
  });

  test.each(["pending", "in_discussion"])(
    "Product deletion is blocked when product is in a %s swap",
    async (status) => {
      const product = await createProductForDelete({ status: "reserved" });
      const swap = await createLinkedSwapForProduct(product, status);

      const res = await request(app)
        .delete(`/products/${product._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/cannot be deleted/i);
      expect(res.body.swap_status).toBe(status);

      const preservedProduct = await Product.findById(product._id);
      const preservedSwap = await SwapRequest.findById(swap._id);
      expect(preservedProduct).toBeTruthy();
      expect(String(preservedSwap.product_offered)).toBe(String(product._id));
    }
  );

  test.each(["payment_pending", "exchange_setup", "in_progress"])(
    "Product deletion is blocked when product is in a %s swap",
    async (status) => {
      const product = await createProductForDelete({ status: "reserved" });
      const swap = await createLinkedSwapForProduct(product, status);

      const res = await request(app)
        .delete(`/products/${product._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/swap history/i);
      expect(res.body.swap_status).toBe(status);

      const activeDanglingSwap = await SwapRequest.findOne({
        _id: swap._id,
        status,
        product_offered: product._id,
      });
      const preservedProduct = await Product.findById(product._id);

      expect(activeDanglingSwap).toBeTruthy();
      expect(preservedProduct).toBeTruthy();
    }
  );

  test.each(["completed", "rejected", "cancelled"])(
    "Product deletion is blocked for %s swap history",
    async (status) => {
      const productStatus = status === "completed" ? "swapped" : "available";
      const product = await createProductForDelete({ status: productStatus });
      await createLinkedSwapForProduct(product, status);

      const res = await request(app)
        .delete(`/products/${product._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toMatch(/history/i);
      await expect(Product.findById(product._id)).resolves.toBeTruthy();
    }
  );

  test("Saved products are real, toggleable, owner-disabled, and filtered", async () => {
    const availableProduct = await Product.create({
      owner_id: raterId,
      title: "Saved public backpack",
      description: "Available item to save",
      category: "Fashion",
      condition: "good",
      estimated_value: 300,
      location: "Cairo",
      status: "available",
    });
    const swappedProduct = await Product.create({
      owner_id: raterId,
      title: "Saved swapped jacket",
      description: "Previously saved swapped item",
      category: "Fashion",
      condition: "fair",
      estimated_value: 250,
      location: "Cairo",
      status: "swapped",
    });
    const inactiveProduct = await Product.create({
      owner_id: raterId,
      title: "Saved inactive listing",
      category: "Fashion",
      condition: "good",
      estimated_value: 200,
      location: "Cairo",
      status: "inactive",
    });
    const rejectedProduct = await Product.create({
      owner_id: raterId,
      title: "Saved rejected listing",
      category: "Fashion",
      condition: "good",
      estimated_value: 200,
      location: "Cairo",
      status: "rejected",
    });
    const reservedProduct = await Product.create({
      owner_id: raterId,
      title: "Saved reserved listing",
      category: "Fashion",
      condition: "good",
      estimated_value: 200,
      location: "Cairo",
      status: "reserved",
    });

    const ownSave = await request(app)
      .post(`/products/${createdProductId}/save`)
      .set("Authorization", `Bearer ${token}`);

    expect(ownSave.statusCode).toBe(400);
    expect(ownSave.body.is_saved).toBe(false);

    const save = await request(app)
      .post(`/products/${availableProduct._id}/save`)
      .set("Authorization", `Bearer ${token}`);

    expect(save.statusCode).toBe(200);
    expect(save.body.is_saved).toBe(true);
    expect(save.body.saved_count).toBe(1);

    const listing = await request(app)
      .get("/products")
      .set("Authorization", `Bearer ${token}`)
      .query({ status: "available", q: "Saved public backpack", limit: 20 });

    expect(listing.statusCode).toBe(200);
    expect(listing.body.products).toHaveLength(1);
    expect(listing.body.products[0].is_saved).toBe(true);

    const unsave = await request(app)
      .post(`/products/${availableProduct._id}/save`)
      .set("Authorization", `Bearer ${token}`);

    expect(unsave.statusCode).toBe(200);
    expect(unsave.body.is_saved).toBe(false);
    expect(unsave.body.saved_count).toBe(0);

    const resave = await request(app)
      .post(`/products/${availableProduct._id}/save`)
      .set("Authorization", `Bearer ${token}`);

    expect(resave.statusCode).toBe(200);
    expect(resave.body.is_saved).toBe(true);
    expect(resave.body.saved_count).toBe(1);

    await User.updateOne(
      { _id: ownerId },
      {
        $addToSet: {
          saved_products: {
            $each: [
              swappedProduct._id,
              inactiveProduct._id,
              rejectedProduct._id,
              reservedProduct._id,
            ],
          },
        },
      }
    );
    await User.updateOne(
      { _id: ownerId },
      { $push: { saved_products: availableProduct._id } }
    );

    const savedList = await request(app)
      .get("/products/saved")
      .set("Authorization", `Bearer ${token}`);

    expect(savedList.statusCode).toBe(200);
    const savedTitles = savedList.body.products.map((product) => product.title);
    expect(savedTitles).toEqual(expect.arrayContaining([
      "Saved public backpack",
      "Saved swapped jacket",
    ]));
    expect(savedTitles).not.toContain("Saved inactive listing");
    expect(savedTitles).not.toContain("Saved rejected listing");
    expect(savedTitles).not.toContain("Saved reserved listing");
    expect(savedTitles.filter((title) => title === "Saved public backpack")).toHaveLength(1);
    expect(savedList.body.products.every((product) => product.is_saved)).toBe(true);
  });

  test("Public profile hydrates saved state per viewer without exposing private fields", async () => {
    const unique = `${Date.now()}-${Math.random()}`;
    const profileOwner = await User.create({
      first_name: "Profile",
      last_name: "Owner",
      email: `profile-owner-${unique}@test.com`,
      password: "hashed",
      phone: "+201001234567",
      street_address: "15 Abbas El Akkad",
      isEmailVerified: true,
    });
    const viewer = await User.create({
      first_name: "Saved",
      last_name: "Viewer",
      email: `saved-viewer-${unique}@test.com`,
      password: "hashed",
      isEmailVerified: true,
    });
    const otherViewer = await User.create({
      first_name: "Other",
      last_name: "Viewer",
      email: `other-viewer-${unique}@test.com`,
      password: "hashed",
      isEmailVerified: true,
    });
    const profileProduct = await Product.create({
      owner_id: profileOwner._id,
      title: `Public profile saved state ${unique}`,
      description: "Profile product with viewer-specific saved state",
      category: "Electronics",
      condition: "good",
      estimated_value: 700,
      location: "Cairo",
      status: "available",
    });
    const viewerToken = jwt.sign({ userId: viewer._id }, process.env.JWT_SECRET);
    const otherViewerToken = jwt.sign({ userId: otherViewer._id }, process.env.JWT_SECRET);

    const save = await request(app)
      .post(`/products/${profileProduct._id}/save`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(save.statusCode).toBe(200);
    expect(save.body.is_saved).toBe(true);

    const [guestProfile, viewerProfile, otherViewerProfile] = await Promise.all([
      request(app).get(`/users/${profileOwner._id}`),
      request(app)
        .get(`/users/${profileOwner._id}`)
        .set("Authorization", `Bearer ${viewerToken}`),
      request(app)
        .get(`/users/${profileOwner._id}`)
        .set("Authorization", `Bearer ${otherViewerToken}`),
    ]);

    expect(guestProfile.statusCode).toBe(200);
    expect(viewerProfile.statusCode).toBe(200);
    expect(otherViewerProfile.statusCode).toBe(200);

    const guestProduct = guestProfile.body.products.find((product) => product._id === String(profileProduct._id));
    const viewerProduct = viewerProfile.body.products.find((product) => product._id === String(profileProduct._id));
    const otherViewerProduct = otherViewerProfile.body.products.find((product) => product._id === String(profileProduct._id));

    expect(guestProduct.is_saved).toBe(false);
    expect(viewerProduct.is_saved).toBe(true);
    expect(otherViewerProduct.is_saved).toBe(false);
    expect(guestProfile.body.user.email).toBeUndefined();
    expect(guestProfile.body.user.phone).toBeUndefined();
    expect(guestProfile.body.user.street_address).toBeUndefined();
    expect(guestProfile.body.user.saved_products).toBeUndefined();
    expect(viewerProfile.body.user.saved_products).toBeUndefined();
  });

  test("AI recommendations use real scoring and priority boosts", async () => {
    const sourceProduct = await Product.create({
      owner_id: ownerId,
      title: "Canon camera body",
      description: "Mirrorless camera in good condition",
      category: "Electronics",
      condition: "good",
      estimated_value: 10000,
      location: "Cairo",
      status: "available",
    });

    const matchingCandidate = await Product.create({
      owner_id: raterId,
      title: "Gaming laptop",
      description: "Fast laptop for editing",
      category: "Electronics",
      condition: "good",
      estimated_value: 8000,
      location: "Cairo",
      status: "available",
    });

    await Product.create({
      owner_id: ownerId,
      title: "Own available product",
      category: "Books & Media",
      condition: "poor",
      estimated_value: 100,
      location: "Alexandria",
      status: "available",
    });

    await Product.create({
      owner_id: raterId,
      title: "Reserved candidate",
      category: "Electronics",
      condition: "good",
      estimated_value: 8000,
      location: "Cairo",
      status: "reserved",
    });

    await Rating.create({
      swap: new mongoose.Types.ObjectId(),
      rater: ownerId,
      rated_user: raterId,
      score: 5,
      tags: ["accurate"],
      comment: "Great swapper.",
    });

    const beforeBoost = await request(app)
      .get("/products/recommendations")
      .set("Authorization", `Bearer ${token}`);

    expect(beforeBoost.statusCode).toBe(200);
    const initialMatch = beforeBoost.body.recommendations.find(
      (item) => String(item.candidate_product._id) === String(matchingCandidate._id)
    );
    expect(initialMatch).toBeTruthy();
    expect(initialMatch.score).toBeGreaterThanOrEqual(94);
    expect(initialMatch.reasons.map((reason) => reason.label)).toEqual(
      expect.arrayContaining(["Same category", "Similar estimated value", "Same city", "Same condition"])
    );
    expect(beforeBoost.body.recommendations.some(
      (item) => item.candidate_product.title === "Own available product"
    )).toBe(false);
    expect(beforeBoost.body.recommendations.some(
      (item) => item.candidate_product.title === "Reserved candidate"
    )).toBe(false);

    const buyCredit = await request(app)
      .post("/users/me/wallet/priority-matching")
      .set("Authorization", `Bearer ${token}`);

    expect(buyCredit.statusCode).toBe(200);
    expect(buyCredit.body.wallet.priority_matches_available).toBe(1);

    const boost = await request(app)
      .post(`/products/${sourceProduct._id}/priority-boost`)
      .set("Authorization", `Bearer ${token}`);

    expect(boost.statusCode).toBe(200);
    expect(boost.body.wallet.priority_matches_available).toBe(0);
    expect(boost.body.product.priority_boosted_until).toBeTruthy();

    const afterBoost = await request(app)
      .get("/products/recommendations")
      .set("Authorization", `Bearer ${token}`);
    const boostedMatch = afterBoost.body.recommendations.find(
      (item) => String(item.candidate_product._id) === String(matchingCandidate._id)
    );

    expect(afterBoost.statusCode).toBe(200);
    expect(boostedMatch.score).toBe(100);
    expect(boostedMatch.priority_boost_active).toBe(true);
    expect(boostedMatch.scoreBreakdown.priority).toBe(6);
    expect(boostedMatch.reasons.map((reason) => reason.label)).toContain("Priority boost on your listed product");
    expect(boostedMatch.candidate_owner_rating).toBe(5);
    expect(boostedMatch.candidate_product.owner_id.trust_score).toBeGreaterThan(0);
  });
});
