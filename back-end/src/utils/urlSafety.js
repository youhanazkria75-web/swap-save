const LOCAL_PUBLIC_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SENSITIVE_QUERY_MARKERS = [
  "hmac",
  "token",
  "payment_key",
  "api_key",
  "secret",
  "signature",
];

const isLocalPublicHostname = (hostname = "") =>
  LOCAL_PUBLIC_HOSTS.has(String(hostname).trim().toLowerCase());

const isNgrokHostname = (hostname = "") =>
  String(hostname).trim().toLowerCase().includes("ngrok");

const getUnsafeProductionUrlReason = (urlOrValue) => {
  const url = urlOrValue instanceof URL ? urlOrValue : new URL(urlOrValue);
  const hostname = url.hostname.toLowerCase();

  if (isLocalPublicHostname(hostname)) {
    return "must not use localhost, 127.0.0.1, or ::1 in production.";
  }

  if (isNgrokHostname(hostname)) {
    return "must not use ngrok URLs in production.";
  }

  return "";
};

const isSensitiveQueryKey = (key = "") => {
  const lowerKey = String(key).toLowerCase();
  return SENSITIVE_QUERY_MARKERS.some((marker) => lowerKey.includes(marker));
};

const sanitizeUrlForLogging = (value = "") => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return rawValue;

  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:\/\//i.test(rawValue);
    const url = new URL(rawValue, "http://swap-save.local");
    const safeParams = [];

    url.searchParams.forEach((paramValue, key) => {
      const safeValue = isSensitiveQueryKey(key) ? "[redacted]" : paramValue;
      safeParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(safeValue)}`);
    });

    const safeSearch = safeParams.length > 0 ? `?${safeParams.join("&")}` : "";
    const safePath = `${url.pathname}${safeSearch}${url.hash}`;

    return isAbsolute ? `${url.origin}${safePath}` : safePath;
  } catch (_error) {
    return rawValue.replace(
      /([?&][^=&#]*(?:hmac|token|payment_key|api_key|secret|signature)[^=&#]*=)[^&#]*/gi,
      "$1[redacted]"
    );
  }
};

module.exports = {
  getUnsafeProductionUrlReason,
  isLocalPublicHostname,
  isNgrokHostname,
  isSensitiveQueryKey,
  sanitizeUrlForLogging,
};
