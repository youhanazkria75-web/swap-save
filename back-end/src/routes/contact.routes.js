const express = require("express");
const router = express.Router();

const optionalAuthMiddleware = require("../middlewares/optional-auth.middleware");
const contactController = require("../controllers/contact.controller");

router.post("/", optionalAuthMiddleware, contactController.createContactMessage);

module.exports = router;
