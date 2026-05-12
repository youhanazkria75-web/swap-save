const DELIVERY_STATUS = Object.freeze({
  PENDING_PICKUP: "pending_pickup",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  DELIVERED_TO_RECEIVER: "delivered_to_receiver",
  DELIVERY_COMPLETED: "delivery_completed",
});

const DELIVERY_STATUSES = Object.freeze(Object.values(DELIVERY_STATUS));

const asPlainObject = (value) =>
  value && typeof value.toObject === "function" ? value.toObject() : value;

const normalizeDeliveryTracking = (detailsOrTracking = {}) => {
  const source = asPlainObject(detailsOrTracking) || {};
  const tracking = asPlainObject(source.tracking) || source;

  return {
    requester_item_picked_up: Boolean(tracking.requester_item_picked_up),
    receiver_item_picked_up: Boolean(tracking.receiver_item_picked_up),
    delivered_to_requester: Boolean(tracking.delivered_to_requester),
    delivered_to_receiver: Boolean(tracking.delivered_to_receiver),
  };
};

const getDeliveryStatusFromTracking = (detailsOrTracking = {}) => {
  const tracking = normalizeDeliveryTracking(detailsOrTracking);

  if (tracking.delivered_to_requester && tracking.delivered_to_receiver) {
    return DELIVERY_STATUS.DELIVERY_COMPLETED;
  }

  if (tracking.delivered_to_requester || tracking.delivered_to_receiver) {
    return DELIVERY_STATUS.DELIVERED_TO_RECEIVER;
  }

  if (tracking.requester_item_picked_up && tracking.receiver_item_picked_up) {
    return DELIVERY_STATUS.IN_TRANSIT;
  }

  if (tracking.requester_item_picked_up || tracking.receiver_item_picked_up) {
    return DELIVERY_STATUS.PICKED_UP;
  }

  return DELIVERY_STATUS.PENDING_PICKUP;
};

const isDeliveryCompleted = (detailsOrTracking = {}) =>
  getDeliveryStatusFromTracking(detailsOrTracking) === DELIVERY_STATUS.DELIVERY_COMPLETED;

const isDeliveryStatus = (status) => DELIVERY_STATUSES.includes(status);

module.exports = {
  DELIVERY_STATUS,
  DELIVERY_STATUSES,
  getDeliveryStatusFromTracking,
  isDeliveryCompleted,
  isDeliveryStatus,
  normalizeDeliveryTracking,
};
