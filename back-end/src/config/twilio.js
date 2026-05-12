const twilio = require("twilio");

let cachedClient = null;
let cachedAccountSid = "";
let cachedAuthToken = "";

const getVerifyConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !serviceSid) {
    const error = new Error("Phone verification is not configured.");
    error.statusCode = 500;
    error.code = "TWILIO_VERIFY_NOT_CONFIGURED";
    throw error;
  }

  return { accountSid, authToken, serviceSid };
};

const getClient = () => {
  const { accountSid, authToken } = getVerifyConfig();

  if (!cachedClient || cachedAccountSid !== accountSid || cachedAuthToken !== authToken) {
    cachedClient = twilio(accountSid, authToken);
    cachedAccountSid = accountSid;
    cachedAuthToken = authToken;
  }

  return cachedClient;
};

const getVerifyService = () => {
  const { serviceSid } = getVerifyConfig();
  return getClient().verify.v2.services(serviceSid);
};

const sendPhoneVerificationCode = (to) =>
  getVerifyService().verifications.create({
    to,
    channel: "sms",
  });

const checkPhoneVerificationCode = ({ to, code }) =>
  getVerifyService().verificationChecks.create({
    to,
    code,
  });

const isTwilioConfigurationError = (error) =>
  error && error.code === "TWILIO_VERIFY_NOT_CONFIGURED";

module.exports = {
  checkPhoneVerificationCode,
  isTwilioConfigurationError,
  sendPhoneVerificationCode,
};
