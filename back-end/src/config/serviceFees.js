// Swap service fees are a fixed EGP amount charged to each participant.
// This fixed fee covers platform admin review, safe swap flow, support, and dispute handling.
// Total platform fee per swap is 30 EGP when both participants pay.
const SERVICE_FEE_EGP = 15;
const SERVICE_FEE_CURRENCY = "EGP";
const SERVICE_FEE_POLICY = "fixed_per_participant";

const DEFAULT_SWAP_SERVICE_FEE_EGP = SERVICE_FEE_EGP;

const getSwapServiceFeeEGP = () => SERVICE_FEE_EGP;

module.exports = {
  DEFAULT_SWAP_SERVICE_FEE_EGP,
  SERVICE_FEE_CURRENCY,
  SERVICE_FEE_EGP,
  SERVICE_FEE_POLICY,
  getSwapServiceFeeEGP,
};
