const nodemailer = require("nodemailer");

const {
  sendPasswordResetEmail,
  sendSupportReplyEmail,
  sendVerificationEmail,
} = require("../src/config/email");

const SMTP_ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SMTP_REPLY_TO",
];

const setSmtpEnv = ({ replyTo } = {}) => {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "mailer@example.com";
  process.env.SMTP_PASS = "smtp-password";
  process.env.SMTP_FROM = "Swap & Save <noreply@swapandsave.app>";

  if (replyTo === undefined) {
    delete process.env.SMTP_REPLY_TO;
  } else {
    process.env.SMTP_REPLY_TO = replyTo;
  }
};

describe("email config", () => {
  let originalEnv;
  let sendMailMock;
  let createTransportSpy;

  beforeEach(() => {
    originalEnv = Object.fromEntries(SMTP_ENV_KEYS.map((key) => [key, process.env[key]]));
    sendMailMock = jest.fn().mockResolvedValue({});
    createTransportSpy = jest.spyOn(nodemailer, "createTransport").mockReturnValue({
      verify: jest.fn().mockResolvedValue(true),
      sendMail: sendMailMock,
    });
  });

  afterEach(() => {
    createTransportSpy.mockRestore();

    for (const key of SMTP_ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  test("includes SMTP_REPLY_TO on outgoing app emails when configured", async () => {
    setSmtpEnv({ replyTo: "Swap & Save Support <support@swapandsave.app>" });

    await sendVerificationEmail({
      to: "user@example.com",
      name: "User",
      verificationUrl: "https://www.swapandsave.app/verify-email?token=test",
    });
    await sendPasswordResetEmail({
      to: "user@example.com",
      name: "User",
      resetUrl: "https://www.swapandsave.app/reset-password?token=test",
    });
    await sendSupportReplyEmail({
      to: "user@example.com",
      name: "User",
      ticketSubject: "Question",
      reply: "Thanks for reaching out.",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(3);
    for (const call of sendMailMock.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({
        from: "Swap & Save <noreply@swapandsave.app>",
        replyTo: "Swap & Save Support <support@swapandsave.app>",
      }));
    }
  });

  test("keeps sending without replyTo when SMTP_REPLY_TO is missing", async () => {
    setSmtpEnv();

    await sendVerificationEmail({
      to: "user@example.com",
      name: "User",
      verificationUrl: "https://www.swapandsave.app/verify-email?token=test",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      from: "Swap & Save <noreply@swapandsave.app>",
      to: "user@example.com",
    }));
    expect(sendMailMock.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });
});
