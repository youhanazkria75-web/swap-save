const {
  sanitizeUrlForLogging,
} = require("../src/utils/urlSafety");

describe("URL safety helpers", () => {
  test("redacts sensitive request query params before logging", () => {
    const sanitized = sanitizeUrlForLogging(
      "/payments/paymob/webhook?hmac=real-signature&amount_cents=1500&payment_token=secret-token&status=ok"
    );

    expect(sanitized).toContain("/payments/paymob/webhook?");
    expect(sanitized).toContain("amount_cents=1500");
    expect(sanitized).toContain("status=ok");
    expect(sanitized).toContain("hmac=%5Bredacted%5D");
    expect(sanitized).toContain("payment_token=%5Bredacted%5D");
    expect(sanitized).not.toContain("real-signature");
    expect(sanitized).not.toContain("secret-token");
  });

  test("redacts sensitive absolute URL query params before logging", () => {
    const sanitized = sanitizeUrlForLogging(
      "https://api.example.com/payments/paymob/webhook?api_key=secret&signature=sig&order=123"
    );

    expect(sanitized).toBe(
      "https://api.example.com/payments/paymob/webhook?api_key=%5Bredacted%5D&signature=%5Bredacted%5D&order=123"
    );
  });
});
