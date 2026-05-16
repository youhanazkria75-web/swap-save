const nodemailer = require("nodemailer");

const requiredSmtpEnv = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

const getEnv = (key) => process.env[key]?.trim();
const DEFAULT_SMTP_TIMEOUT_MS = 15000;

const getMissingSmtpConfig = () => {
  return requiredSmtpEnv.filter((key) => !getEnv(key));
};

const hasSmtpConfig = () => {
  return getMissingSmtpConfig().length === 0;
};

const getSmtpTimeoutMs = () => {
  const configured = Number(getEnv("SMTP_TIMEOUT_MS") || getEnv("SMTP_CONNECTION_TIMEOUT_MS"));

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return DEFAULT_SMTP_TIMEOUT_MS;
};

const createTransporter = () => {
  if (!hasSmtpConfig()) return null;

  const timeoutMs = getSmtpTimeoutMs();

  return nodemailer.createTransport({
    host: getEnv("SMTP_HOST"),
    port: Number(getEnv("SMTP_PORT")),
    secure: getEnv("SMTP_SECURE") === "true",
    family: 4,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
    auth: {
      user: getEnv("SMTP_USER"),
      pass: getEnv("SMTP_PASS"),
    },
  });
};

const classifyEmailFailure = (error) => {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  if (
    code === "ETIMEDOUT" ||
    message.includes("connection timeout") ||
    message.includes("greeting timeout") ||
    message.includes("socket timeout") ||
    message.includes("timed out")
  ) {
    return "connection timeout";
  }

  if (
    ["ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(code) ||
    message.includes("network is unreachable") ||
    message.includes("connection refused") ||
    message.includes("getaddrinfo")
  ) {
    return "connection failure";
  }

  if (
    code === "EAUTH" ||
    message.includes("authentication") ||
    message.includes("invalid login") ||
    message.includes("invalid credentials")
  ) {
    return "authentication failure";
  }

  return "send failure";
};

const createSafeEmailError = (error) => {
  const failure = classifyEmailFailure(error);
  const safeError = new Error(`email ${failure}`);

  safeError.code = "EMAIL_SEND_FAILED";
  safeError.emailFailure = failure;

  return safeError;
};

const runEmailSend = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    throw createSafeEmailError(error);
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatPlainText = (value) => String(value ?? "").replace(/\r\n/g, "\n");

const buildMailOptions = (options) => {
  const replyTo = getEnv("SMTP_REPLY_TO");

  return replyTo ? { ...options, replyTo } : options;
};

const sendVerificationEmail = async ({ to, name, verificationUrl }) => {
  const from = getEnv("SMTP_FROM");
  const transporter = createTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[email] SMTP is not configured. Missing: ${getMissingSmtpConfig().join(", ")}. No verification email was sent.`
      );
    } else {
      console.warn(
        `[email] SMTP is not configured. Missing: ${getMissingSmtpConfig().join(", ")}. No verification email was sent.`
      );
    }
    return { sent: false, skipped: true };
  }

  await runEmailSend(async () => {
    await transporter.verify();

    await transporter.sendMail(buildMailOptions({
      from,
      to,
      subject: "Verify your Swap & Save email",
      text: `Hi ${name},\n\nVerify your email by opening this link:\n${verificationUrl}\n\nThis link expires in 24 hours.`,
      html: `
        <p>Hi ${name},</p>
        <p>Verify your email by opening this link:</p>
        <p><a href="${verificationUrl}">Verify email</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    }));
  });

  return { sent: true, skipped: false };
};

const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  const from = getEnv("SMTP_FROM");
  const transporter = createTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[email] SMTP is not configured. Missing: ${getMissingSmtpConfig().join(", ")}. No password reset email was sent.`
      );
    } else {
      console.warn(
        `[email] SMTP is not configured. Missing: ${getMissingSmtpConfig().join(", ")}. No password reset email was sent.`
      );
    }
    return { sent: false, skipped: true };
  }

  await runEmailSend(async () => {
    await transporter.verify();

    await transporter.sendMail(buildMailOptions({
      from,
      to,
      subject: "Reset your Swap & Save password",
      text: `Hi ${name},\n\nReset your password by opening this link:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
      html: `
        <p>Hi ${name},</p>
        <p>Reset your password by opening this link:</p>
        <p><a href="${resetUrl}">Reset password</a></p>
        <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      `,
    }));
  });

  return { sent: true, skipped: false };
};

const sendSupportReplyEmail = async ({ to, name, ticketSubject, reply }) => {
  const from = getEnv("SMTP_FROM");
  const transporter = createTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        `[email] SMTP is not configured. Missing: ${getMissingSmtpConfig().join(", ")}. No support reply email was sent.`
      );
    }
    return { sent: false, skipped: true };
  }

  const safeName = name || "there";
  const plainReply = formatPlainText(reply);
  const plainSubject = formatPlainText(ticketSubject);

  await runEmailSend(async () => {
    await transporter.verify();

    await transporter.sendMail(buildMailOptions({
      from,
      to,
      subject: "Update on your Swap & Save support request",
      text: `Hi ${safeName},\n\nWe have an update on your support request${plainSubject ? `: ${plainSubject}` : ""}.\n\n${plainReply}\n\nSwap & Save Support`,
      html: `
        <p>Hi ${escapeHtml(safeName)},</p>
        <p>We have an update on your support request${plainSubject ? `: <strong>${escapeHtml(plainSubject)}</strong>` : ""}.</p>
        <p>${escapeHtml(plainReply).replace(/\n/g, "<br>")}</p>
        <p>Swap &amp; Save Support</p>
      `,
    }));
  });

  return { sent: true, skipped: false };
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSupportReplyEmail,
};
