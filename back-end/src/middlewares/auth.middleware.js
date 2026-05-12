const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("_id role is_deleted isEmailVerified");

    if (!user || user.is_deleted) {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (user.role !== "admin" && user.isEmailVerified !== true) {
      return res.status(403).json({ message: "Please verify your email before continuing." });
    }

    req.userId = decoded.userId;
    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;
