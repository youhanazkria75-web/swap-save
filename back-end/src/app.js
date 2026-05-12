const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");
const morgan = require("morgan");
const logger = require("./config/logger");
const crypto = require("crypto");
const hpp = require("hpp");
const path = require("path");
const { xss } = require("express-xss-sanitizer");
const noSqlSanitizer = require("./middlewares/sanitize.middleware");

const app = express();
app.set("trust proxy", 1);
const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = !isProduction;
const shouldExposeApiDocs = !isProduction || process.env.ENABLE_API_DOCS === "true";

// ================= REQUEST ID =================
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

// ================= SECURITY HEADERS =================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // Swagger UI أسهل مع CSP مقفولة حالياً
    contentSecurityPolicy: isProduction ? undefined : false,
  })
);

// ================= RATE LIMITERS =================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 200,
  message: "Too many requests from this IP, please try again later.",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 20,
  message: "Too many login attempts. Please try again later.",
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 5000 : 50,
  message: "Too many admin requests.",
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 1000 : 10,
  message: "Too many contact submissions. Please try again later.",
});

app.use(apiLimiter);

// ================= REQUEST LOGGING =================
app.use(
  morgan("dev", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

// ================= CORS CONFIG =================
const configuredOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);
const developmentOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];
const allowedOrigins = [
  ...configuredOrigins,
  ...(isProduction ? [] : developmentOrigins),
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS not allowed for this origin"));
    },
    credentials: true,
  })
);

// ================= GENERAL MIDDLEWARES =================
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ================= INPUT HARDENING =================
// NoSQL injection keys
app.use(noSqlSanitizer);

// XSS sanitization
app.use(
  xss({
    maxDepth: 50,
  })
);

// HTTP Parameter Pollution
app.use(hpp());

// ================= HEALTHCHECK =================
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Swap & Save API",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get("/ready", (req, res) => {
  res.status(200).json({
    status: "ready",
    service: "Swap & Save API",
    timestamp: new Date().toISOString(),
  });
});

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Swap & Save API is running ✅");
});

// ================= ROUTES =================
const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const swapRoutes = require("./routes/swap.routes");
const notificationRoutes = require("./routes/notification.routes");
const adminRoutes = require("./routes/admin.routes");
const userRoutes = require("./routes/user.routes");
const contactRoutes = require("./routes/contact.routes");
const paymentRoutes = require("./routes/payment.routes");

app.use("/auth", authLimiter, authRoutes);
app.use("/products", productRoutes);
app.use("/swaps", swapRoutes);
app.use("/notifications", notificationRoutes);
app.use("/admin", adminLimiter, adminRoutes);
app.use("/users", userRoutes);
app.use("/contact", contactLimiter, contactRoutes);
app.use("/payments", paymentRoutes);

// ================= API DOCS =================
if (shouldExposeApiDocs) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// ================= PROTECTED TEST =================
if (!isProduction) {
  const authMiddleware = require("./middlewares/auth.middleware");

  app.get("/protected", authMiddleware, (req, res) => {
    res.json({
      message: "You are authorized ✅",
      userId: req.userId,
    });
  });
}

// ================= ERROR HANDLING =================
const { notFound, errorHandler } = require("./middlewares/error.middleware");

app.use(notFound);
app.use(errorHandler);

module.exports = app;
