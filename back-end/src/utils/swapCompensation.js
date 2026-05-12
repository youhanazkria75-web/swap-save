const User = require("../models/User");
const { createCoinTransaction } = require("./wallet");

const getId = (value) => {
  if (!value) return value;
  return value._id || value;
};

const getCompensationAmount = (swap) => Number(swap.compensation_amount || 0);

const holdCompensationCoins = async (swap, acceptedBy) => {
  const amount = getCompensationAmount(swap);
  const payer = getId(swap.compensation_payer);

  if (swap.compensation_status !== "proposed" || !payer || amount <= 0) {
    return { moved: false };
  }

  const updatedPayer = await User.findOneAndUpdate(
    { _id: payer, coins: { $gte: amount } },
    { $inc: { coins: -amount, held_coins: amount } },
    { new: true }
  );

  if (!updatedPayer) {
    const error = new Error("Payer does not have enough available coins");
    error.statusCode = 400;
    throw error;
  }

  swap.compensation_status = "held";
  swap.compensation_accepted_by = acceptedBy;
  swap.compensation_accepted_at = new Date();
  await swap.save();

  await createCoinTransaction({
    user: payer,
    swap,
    type: "coin_hold",
    direction: "hold",
    amount,
    status: "completed",
    description: "Coins held for swap compensation",
  });

  return { moved: true, amount, payer };
};

const releaseCompensationCoins = async (swap) => {
  const amount = getCompensationAmount(swap);
  const payer = getId(swap.compensation_payer);
  const receiver = getId(swap.compensation_receiver);

  if (swap.compensation_status !== "held" || !payer || !receiver || amount <= 0) {
    return { moved: false };
  }

  const updatedPayer = await User.findOneAndUpdate(
    { _id: payer, held_coins: { $gte: amount } },
    { $inc: { held_coins: -amount, total_coins_spent: amount } },
    { new: true }
  );

  if (!updatedPayer) {
    const error = new Error("Held compensation coins are not available for release");
    error.statusCode = 400;
    throw error;
  }

  await User.findByIdAndUpdate(receiver, {
    $inc: { coins: amount, total_coins_earned: amount },
  });

  swap.compensation_status = "released";
  await swap.save();

  await createCoinTransaction({
    user: payer,
    swap,
    type: "coin_release",
    direction: "release",
    amount,
    status: "completed",
    description: "Held coins released for completed swap compensation",
  });

  await createCoinTransaction({
    user: receiver,
    swap,
    type: "coin_credit",
    direction: "credit",
    amount,
    status: "completed",
    description: "Coins received from completed swap compensation",
  });

  return { moved: true, amount, payer, receiver };
};

const refundCompensationCoins = async (swap) => {
  const amount = getCompensationAmount(swap);
  const payer = getId(swap.compensation_payer);

  if (swap.compensation_status !== "held" || !payer || amount <= 0) {
    return { moved: false };
  }

  const updatedPayer = await User.findOneAndUpdate(
    { _id: payer, held_coins: { $gte: amount } },
    { $inc: { held_coins: -amount, coins: amount } },
    { new: true }
  );

  if (!updatedPayer) {
    const error = new Error("Held compensation coins are not available for refund");
    error.statusCode = 400;
    throw error;
  }

  swap.compensation_status = "refunded";
  await swap.save();

  await createCoinTransaction({
    user: payer,
    swap,
    type: "coin_refund",
    direction: "refund",
    amount,
    status: "refunded",
    description: "Held swap compensation coins refunded",
  });

  return { moved: true, amount, payer };
};

module.exports = {
  holdCompensationCoins,
  releaseCompensationCoins,
  refundCompensationCoins,
};
