const crypto = require("crypto");
const logger = require("../config/logger");
const { getUnsafeProductionUrlReason } = require("../utils/urlSafety");

const PAYMOB_BASE_URL = process.env.PAYMOB_BASE_URL || "https://accept.paymob.com/api";
const PAYMOB_IFRAME_BASE_URL =
  process.env.PAYMOB_IFRAME_BASE_URL || "https://accept.paymob.com/api/acceptance/iframes";
const DEFAULT_LOCAL_FRONTEND_URL = "http://localhost:3000";
const PAYMOB_SUCCESS_PATH = "/user/coins/payment/success";
const PAYMOB_FAILURE_PATH = "/user/coins/payment/failure";

const CHECKOUT_ENV_KEYS = [
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_IFRAME_ID",
  "PAYMOB_WEBHOOK_URL",
];

const HMAC_ENV_KEYS = ["PAYMOB_HMAC_SECRET"];
const AUTH_ENV_KEYS = ["PAYMOB_API_KEY"];

const PAYMOB_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

const getMissingEnv = (keys) => keys.filter((key) => !process.env[key]);

const getPaymobCurrency = () => (process.env.PAYMOB_CURRENCY || "EGP").trim().toUpperCase();

const getEnvString = (key) =>
  typeof process.env[key] === "string" ? process.env[key].trim() : "";

const isProduction = () => process.env.NODE_ENV === "production";

const throwConfigurationError = (message) => {
  const error = new Error(message);
  error.statusCode = 503;
  throw error;
};

const parseHttpUrl = (value, key) => {
  if (!value) {
    throwConfigurationError(`Paymob checkout is not configured. ${key} is required`);
  }

  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    throwConfigurationError(`Paymob checkout is not configured. ${key} must be an absolute http(s) URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throwConfigurationError(`Paymob checkout is not configured. ${key} must be an absolute http(s) URL`);
  }

  if (isProduction()) {
    const reason = getUnsafeProductionUrlReason(url);

    if (reason) {
      throwConfigurationError(`Paymob checkout is not configured. ${key} ${reason}`);
    }
  }

  return url;
};

const normalizeBaseUrl = (url) => {
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
};

const getPublicFrontendUrl = () => {
  const explicit = getEnvString("FRONTEND_URL") || getEnvString("CLIENT_URL");
  const value = explicit || (isProduction() ? "" : DEFAULT_LOCAL_FRONTEND_URL);
  const url = parseHttpUrl(value, explicit ? (getEnvString("FRONTEND_URL") ? "FRONTEND_URL" : "CLIENT_URL") : "FRONTEND_URL");

  return normalizeBaseUrl(url);
};

const buildFrontendUrl = (path) => {
  const baseUrl = getPublicFrontendUrl();
  const url = new URL(path, `${baseUrl}/`);
  return url.toString();
};

const getPaymobReturnUrls = (payment = {}) => {
  const successUrl =
    getEnvString("PAYMOB_SUCCESS_URL") ||
    payment.successUrl ||
    buildFrontendUrl(PAYMOB_SUCCESS_PATH);
  const failureUrl =
    getEnvString("PAYMOB_FAILURE_URL") ||
    payment.failureUrl ||
    buildFrontendUrl(PAYMOB_FAILURE_PATH);

  return {
    successUrl: parseHttpUrl(successUrl, "PAYMOB_SUCCESS_URL").toString(),
    failureUrl: parseHttpUrl(failureUrl, "PAYMOB_FAILURE_URL").toString(),
  };
};

const assertPaymobCheckoutConfigured = () => {
  const missing = getMissingEnv(CHECKOUT_ENV_KEYS);

  if (missing.length > 0) {
    throwConfigurationError(`Paymob checkout is not configured. Missing: ${missing.join(", ")}`);
  }
};

const assertPaymobWebhookConfigured = () => {
  const missing = getMissingEnv(HMAC_ENV_KEYS);

  if (missing.length > 0) {
    throwConfigurationError(`Paymob webhook verification is not configured. Missing: ${missing.join(", ")}`);
  }
};

const assertPaymobAuthConfigured = () => {
  const missing = getMissingEnv(AUTH_ENV_KEYS);

  if (missing.length > 0) {
    throwConfigurationError(`Paymob API authentication is not configured. Missing: ${missing.join(", ")}`);
  }
};

const getNestedValue = (source, path) => {
  if (source && typeof source === "object" && Object.prototype.hasOwnProperty.call(source, path)) {
    return source[path];
  }

  return path.split(".").reduce((current, key) => {
    if (current && typeof current === "object") {
      return current[key];
    }

    return undefined;
  }, source);
};

const getPaymobHmacFieldValue = (eventObject, field) => {
  if (field === "order.id") {
    if (eventObject && typeof eventObject === "object" && eventObject["order.id"] !== undefined) {
      return eventObject["order.id"];
    }

    const order = eventObject?.order;

    if (order && typeof order === "object") {
      return order.id ?? order._id ?? order.order_id;
    }

    return order ?? eventObject?.order_id;
  }

  return getNestedValue(eventObject, field);
};

const stringifyHmacValue = (value) => {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const getPaymobEventObject = (payload = {}) => {
  if (payload && typeof payload === "object" && payload.obj && typeof payload.obj === "object") {
    return payload.obj;
  }

  return payload || {};
};

const createPaymobHmac = (payload, secret = process.env.PAYMOB_HMAC_SECRET) => {
  const eventObject = getPaymobEventObject(payload);
  const concatenated = PAYMOB_HMAC_FIELDS
    .map((field) => stringifyHmacValue(getPaymobHmacFieldValue(eventObject, field)))
    .join("");

  return crypto
    .createHmac("sha512", secret || "")
    .update(concatenated)
    .digest("hex");
};

const safeCompare = (left, right) => {
  const leftValue = Buffer.from(String(left || "").toLowerCase(), "utf8");
  const rightValue = Buffer.from(String(right || "").toLowerCase(), "utf8");

  if (leftValue.length !== rightValue.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftValue, rightValue);
};

const verifyPaymobHmac = (payload, receivedHmac) => {
  assertPaymobWebhookConfigured();

  if (!receivedHmac) {
    return false;
  }

  const expectedHmac = createPaymobHmac(payload);
  return safeCompare(expectedHmac, receivedHmac);
};

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const paymobRequest = async (path, body, { method = "POST" } = {}) => {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${PAYMOB_BASE_URL}${path}`, {
    ...options,
  });
  const data = await parseJson(response);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && typeof data.message === "string"
        ? data.message
        : `Paymob request failed: ${path}`;
    const error = new Error(message);
    error.statusCode = 502;
    error.paymobResponse = data;
    throw error;
  }

  return data || {};
};

const getPaymobAuthToken = async () => {
  assertPaymobAuthConfigured();

  const authResponse = await paymobRequest("/auth/tokens", {
    api_key: process.env.PAYMOB_API_KEY,
  });
  const authToken = authResponse.token;

  if (!authToken) {
    const error = new Error("Paymob authentication did not return a token");
    error.statusCode = 502;
    throw error;
  }

  return authToken;
};

const getBillingValue = (value, fallback = "NA") => {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
};

const buildBillingData = (user) => ({
  first_name: getBillingValue(user.first_name),
  last_name: getBillingValue(user.last_name),
  email: getBillingValue(user.email, "customer@example.com"),
  phone_number: getBillingValue(user.phone, "01000000000"),
  apartment: "NA",
  floor: "NA",
  street: getBillingValue(user.street_address || user.address),
  building: "NA",
  shipping_method: "NA",
  postal_code: "NA",
  city: getBillingValue(user.city, "Cairo"),
  country: getBillingValue(user.country, "EG"),
  state: getBillingValue(user.area),
});

const createPaymobCheckoutSession = async ({
  user,
  coinPackage,
  transactionId,
  merchantOrderId,
  payment = {},
}) => {
  assertPaymobCheckoutConfigured();

  const currency = getPaymobCurrency();
  const amountEGP = Number(payment.amountEGP ?? coinPackage?.priceEGP);
  const amountCents = Math.round(amountEGP * 100);
  const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID);
  const returnUrls = getPaymobReturnUrls(payment);
  const itemName = payment.name || coinPackage?.name || "Swap & Save payment";
  const itemDescription =
    payment.description ||
    (coinPackage ? `${coinPackage.coins} Swap & Save coins` : "Swap & Save payment");

  if (!Number.isInteger(integrationId) || integrationId <= 0) {
    throwConfigurationError("Paymob checkout is not configured. PAYMOB_INTEGRATION_ID must be a positive number");
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    const error = new Error("Paymob checkout amount must be a positive EGP amount");
    error.statusCode = 400;
    throw error;
  }

  const authResponse = await paymobRequest("/auth/tokens", {
    api_key: process.env.PAYMOB_API_KEY,
  });
  const authToken = authResponse.token;
  const merchantId = authResponse.profile?.id;

  if (!authToken) {
    const error = new Error("Paymob authentication did not return a token");
    error.statusCode = 502;
    throw error;
  }

  const orderResponse = await paymobRequest("/ecommerce/orders", {
    auth_token: authToken,
    merchant_id: merchantId,
    delivery_needed: false,
    amount_cents: amountCents,
    currency,
    merchant_order_id: merchantOrderId,
    items: [
      {
        name: itemName,
        amount_cents: amountCents,
        description: itemDescription,
        quantity: 1,
      },
    ],
  });
  const orderId = orderResponse.id;

  if (!orderId) {
    const error = new Error("Paymob order creation did not return an order id");
    error.statusCode = 502;
    throw error;
  }

  const paymentKeyResponse = await paymobRequest("/acceptance/payment_keys", {
    auth_token: authToken,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: orderId,
    billing_data: buildBillingData(user),
    currency,
    integration_id: integrationId,
    notification_url: process.env.PAYMOB_WEBHOOK_URL,
    redirection_url: returnUrls.successUrl,
  });
  const paymentToken = paymentKeyResponse.token;

  if (!paymentToken) {
    const error = new Error("Paymob payment key creation did not return a token");
    error.statusCode = 502;
    throw error;
  }

  const iframeUrl = `${PAYMOB_IFRAME_BASE_URL}/${process.env.PAYMOB_IFRAME_ID}?payment_token=${encodeURIComponent(paymentToken)}`;

  logger.info(
    `[paymob] return URLs selected ${JSON.stringify({
      paymentType: payment.type || (coinPackage ? "coin_purchase" : "payment"),
      transactionId: String(transactionId),
      merchantOrderId,
      orderId: String(orderId),
      successUrl: returnUrls.successUrl,
      failureUrl: returnUrls.failureUrl,
    })}`
  );

  return {
    provider: "paymob",
    amountCents,
    currency,
    integrationId,
    orderId: String(orderId),
    transactionId: String(transactionId),
    merchantOrderId,
    paymentToken,
    paymentUrl: iframeUrl,
    iframeUrl,
    successUrl: returnUrls.successUrl,
    failureUrl: returnUrls.failureUrl,
  };
};

const retrievePaymobTransaction = async (paymobTransactionId) => {
  const authToken = await getPaymobAuthToken();

  return paymobRequest(
    `/acceptance/transactions/${encodeURIComponent(String(paymobTransactionId))}?token=${encodeURIComponent(authToken)}`,
    undefined,
    { method: "GET" }
  );
};

const inquirePaymobTransaction = async ({ merchantOrderId, paymobOrderId }) => {
  const authToken = await getPaymobAuthToken();

  return paymobRequest("/ecommerce/orders/transaction_inquiry", {
    auth_token: authToken,
    merchant_order_id: merchantOrderId,
    order_id: paymobOrderId,
  });
};

const fetchPaymobPaymentStatus = async ({ paymobTransactionId, paymobOrderId, merchantOrderId }) => {
  if (paymobTransactionId) {
    return retrievePaymobTransaction(paymobTransactionId);
  }

  if (paymobOrderId || merchantOrderId) {
    return inquirePaymobTransaction({ merchantOrderId, paymobOrderId });
  }

  const error = new Error("Paymob payment status cannot be fetched without a Paymob transaction id or order id");
  error.statusCode = 400;
  throw error;
};

module.exports = {
  PAYMOB_HMAC_FIELDS,
  createPaymobCheckoutSession,
  createPaymobHmac,
  fetchPaymobPaymentStatus,
  getPaymobReturnUrls,
  getPaymobCurrency,
  getPaymobEventObject,
  getPublicFrontendUrl,
  inquirePaymobTransaction,
  retrievePaymobTransaction,
  verifyPaymobHmac,
};
