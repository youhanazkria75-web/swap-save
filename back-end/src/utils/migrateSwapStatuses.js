const SwapRequest = require("../models/SwapRequest");
const logger = require("../config/logger");

const migrateSwapStatuses = async () => {
  const result = await SwapRequest.updateMany(
    { status: "accepted" },
    { $set: { status: "in_discussion" } }
  );

  const modifiedCount = result.modifiedCount ?? result.nModified ?? 0;

  if (modifiedCount > 0) {
    logger.info(`Migrated ${modifiedCount} accepted swap status(es) to in_discussion`);
  }
};

module.exports = migrateSwapStatuses;
