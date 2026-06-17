const nodemailer = require("nodemailer");
const {
  buildEmailMessage,
  createAccessChallenge,
  resolveRecipientEmail
} = require("../lib/access-service");

module.exports = async (req, res) => {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
    return;
  }

  try {
    assertAuthorized(req);
    assertSmtpConfig();

    const body = normalizeBody(req.body);
    const extensionId = String(body.extensionId || "").trim();
    const reason = String(body.reason || "startup").trim();
    const recipientEmail = resolveRecipientEmail({
      extensionId,
      fallbackEmail: body.to
    });

    if (!extensionId) {
      res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
      return;
    }

    const challenge = createAccessChallenge({
      extensionId,
      recipientEmail,
      reason
    });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const emailMessage = buildEmailMessage({
      code: challenge.code,
      extensionId,
      reason,
      expiresAt: challenge.expiresAt
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipientEmail,
      subject: emailMessage.subject,
      text: emailMessage.text,
      html: emailMessage.html
    });

    res.status(200).json({
      ok: true,
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      recipientEmail: challenge.maskedEmail
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);

    res.status(statusCode).json({
      ok: false,
      error: error instanceof Error ? error.message : "send_code_failed"
    });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

function assertAuthorized(req) {
  const expectedToken = process.env.WEBHOOK_TOKEN || "";
  const providedToken = getBearerToken(req);

  if (expectedToken && providedToken !== expectedToken) {
    const error = new Error("unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function assertSmtpConfig() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const error = new Error("missing_smtp_config");
    error.statusCode = 500;
    throw error;
  }
}

function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return {};
    }
  }

  return body;
}
