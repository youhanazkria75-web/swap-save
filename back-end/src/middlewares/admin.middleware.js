const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("_id role is_deleted");

    if (!user || user.is_deleted) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = adminMiddleware;
