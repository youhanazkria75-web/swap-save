const jwt = require("jsonwebtoken");
const User = require("../models/User");

const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("_id role is_deleted isEmailVerified");

    if (!user || user.is_deleted || (user.role !== "admin" && user.isEmailVerified !== true)) {
      return next();
    }

    req.userId = decoded.userId;
    req.user = user;
    next();
  } catch (error) {
    next();
  }
};

module.exports = optionalAuthMiddleware;
