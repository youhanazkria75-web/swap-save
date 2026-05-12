const crypto = require("crypto");

const PAYMOB_BASE_URL = process.env.PAYMOB_BASE_URL || "https://accept.paymob.com/api";
const PAYMOB_IFRAME_BASE_URL =
  process.env.PAYMOB_IFRAME_BASE_URL || "https://accept.paymob.com/api/acceptance/iframes";

const CHECKOUT_ENV_KEYS = [
  "PAYMOB_API_KEY",
  "PAYMOB_INTEGRATION_ID",
  "PAYMOB_IFRAME_ID",
  "PAYMOB_WEBHOOK_URL",
  "PAYMOB_SUCCESS_URL",
  "PAYMOB_FAILURE_URL",
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

const throwConfigurationError = (message) => {
  const error = new Error(message);
  error.statusCode = 503;
  throw error;
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
    redirection_url: payment.successUrl || process.env.PAYMOB_SUCCESS_URL,
  });
  const paymentToken = paymentKeyResponse.token;

  if (!paymentToken) {
    const error = new Error("Paymob payment key creation did not return a token");
    error.statusCode = 502;
    throw error;
  }

  const iframeUrl = `${PAYMOB_IFRAME_BASE_URL}/${process.env.PAYMOB_IFRAME_ID}?payment_token=${encodeURIComponent(paymentToken)}`;

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
    successUrl: payment.successUrl || process.env.PAYMOB_SUCCESS_URL,
    failureUrl: payment.failureUrl || process.env.PAYMOB_FAILURE_URL,
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
  getPaymobCurrency,
  getPaymobEventObject,
  inquirePaymobTransaction,
  retrievePaymobTransaction,
  verifyPaymobHmac,
};
