const SwapTimelineEvent = require("../models/SwapTimelineEvent");

const getId = (value) => {
  if (!value) return value;
  return value._id || value;
};

const createSwapTimelineEvent = async ({
  swap,
  event,
  description,
  actor,
  actor_id,
}) => {
  try {
    const swapId = getId(swap);

    if (!swapId || !event || !description || !actor) {
      return null;
    }

    return await SwapTimelineEvent.create({
      swap: swapId,
      event,
      description,
      actor,
      actor_id: actor_id || undefined,
    });
  } catch (error) {
    console.error("Failed to create swap timeline event:", error.message);
    return null;
  }
};

const getSwapTimeline = (swapId) =>
  SwapTimelineEvent.find({ swap: swapId })
    .populate("actor_id", "first_name last_name avatar role")
    .sort({ createdAt: 1 });

const addTimelineToSwap = async (swap) => {
  if (!swap) return swap;

  const swapObject = typeof swap.toObject === "function" ? swap.toObject() : swap;

  try {
    swapObject.timeline = await getSwapTimeline(swapObject._id || swapObject.id);
  } catch (error) {
    console.error("Failed to load swap timeline:", error.message);
    swapObject.timeline = [];
  }

  return swapObject;
};

const getParticipantActor = (swap, userId) => {
  if (String(getId(swap.requester)) === String(userId)) {
    return "requester";
  }

  if (String(getId(swap.receiver)) === String(userId)) {
    return "receiver";
  }

  return "system";
};

module.exports = {
  addTimelineToSwap,
  createSwapTimelineEvent,
  getParticipantActor,
  getSwapTimeline,
};
