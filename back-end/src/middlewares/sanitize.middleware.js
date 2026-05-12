const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

const sanitizeObject = (input) => {
  if (Array.isArray(input)) {
    return input.map(sanitizeObject);
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const clean = {};

  for (const [key, value] of Object.entries(input)) {
    // امنع مفاتيح Mongo الخطيرة
    if (key.startsWith("$") || key.includes(".")) {
      continue;
    }

    clean[key] = sanitizeObject(value);
  }

  return clean;
};

const noSqlSanitizer = (req, res, next) => {
  const preservedPaymobReturnQuery =
    req.path === "/payments/paymob/confirm-return" && req.body?.query && isPlainObject(req.body.query)
      ? req.body.query
      : null;

  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);

  if (preservedPaymobReturnQuery && req.body) {
    req.body.query = preservedPaymobReturnQuery;
  }

  next();
};

module.exports = noSqlSanitizer;
