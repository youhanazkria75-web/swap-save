const DEFAULT_LOCAL_FRONTEND_URL = "http://localhost:3000";

const getEnvValue = (env, key) =>
  typeof env[key] === "string" ? env[key].trim() : "";

const normalizeBaseUrl = (url) => {
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
};

const getFrontendUrl = (env = process.env) => {
  const configured = getEnvValue(env, "FRONTEND_URL") || getEnvValue(env, "CLIENT_URL");
  const value = configured || (env.NODE_ENV === "production" ? "" : DEFAULT_LOCAL_FRONTEND_URL);

  if (!value) {
    throw new Error("FRONTEND_URL or CLIENT_URL is required in production.");
  }

  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    throw new Error("FRONTEND_URL or CLIENT_URL must be an absolute http(s) URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("FRONTEND_URL or CLIENT_URL must be an absolute http(s) URL.");
  }

  return normalizeBaseUrl(url);
};

module.exports = {
  DEFAULT_LOCAL_FRONTEND_URL,
  getFrontendUrl,
};
