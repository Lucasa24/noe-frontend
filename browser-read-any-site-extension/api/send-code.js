const nodemailer = require("nodemailer");
const {
  buildAdminAlertEmailMessage,
  buildEmailMessage,
  buildWhatsAppAlertMessage,
  createAccessChallenge,
  resolveRecipientTargets
} = require("../lib/access-service");
const { recordRecipientActivity } = require("../lib/recipient-activity");

const FIXED_CODE_COPY_EMAIL = "caixa@fimdaep.com";

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
    const recipientEmails = resolveRecipientTargets({
      extensionId,
      fallbackEmail: body.to,
      recipientKey: body.recipientKey
    });
    const recipientEmail = recipientEmails[0];

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

    const fixedCopyEmail = getFixedCopyEmail(recipientEmail);
    const allToRecipients = mergeEmailRecipients(recipientEmails, fixedCopyEmail ? [fixedCopyEmail] : []);

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: allToRecipients.join(", "),
      subject: emailMessage.subject,
      text: emailMessage.text,
      html: emailMessage.html
    });

    // A atividade só é registrada depois que o SMTP aceita o envio principal.
    // O histórico não pode impedir que o usuário receba o código.
    let recipientLastSentAt = null;

    try {
      recipientLastSentAt = await recordRecipientActivity({
        extensionId,
        recipientKey: body.recipientKey,
        sentAt: new Date()
      });
    } catch (error) {
      console.error("recipient_activity_write_failed", error instanceof Error ? error.message : String(error));
    }

    await sendAdminAlertEmail(transporter, {
      code: challenge.code,
      extensionId,
      reason,
      expiresAt: challenge.expiresAt,
      recipientEmail
    });

    await sendWhatsAppAlert({
      code: challenge.code,
      extensionId,
      reason,
      expiresAt: challenge.expiresAt,
      recipientEmail
    });

    res.status(200).json({
      ok: true,
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      recipientEmail: challenge.maskedEmail,
      recipientLastSentAt
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

function getFixedCopyEmail(recipientEmail) {
  const fixedEmail = String(FIXED_CODE_COPY_EMAIL || "").trim().toLowerCase();
  const normalizedRecipientEmail = String(recipientEmail || "").trim().toLowerCase();

  if (!fixedEmail || fixedEmail === normalizedRecipientEmail) {
    return "";
  }

  return fixedEmail;
}

function mergeEmailRecipients(...groups) {
  return Array.from(new Set(
    groups
      .flat()
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
  ));
}

async function sendAdminAlertEmail(transporter, {
  code,
  extensionId,
  reason,
  expiresAt,
  recipientEmail
}) {
  const alertEmailTo = String(process.env.ALERT_EMAIL_TO || "").trim();

  if (!alertEmailTo) {
    return;
  }

  const alertMessage = buildAdminAlertEmailMessage({
    code,
    extensionId,
    reason,
    expiresAt,
    recipientEmail
  });

  try {
    await transporter.sendMail({
      from: process.env.ALERT_EMAIL_FROM || process.env.MAIL_FROM || process.env.SMTP_USER,
      to: alertEmailTo,
      subject: alertMessage.subject,
      text: alertMessage.text,
      html: alertMessage.html
    });
  } catch (error) {
    console.error("admin_alert_email_failed", error instanceof Error ? error.message : String(error));
  }
}

async function sendWhatsAppAlert({ code, extensionId, reason, expiresAt, recipientEmail }) {
  if (String(process.env.WHATSAPP_PROVIDER || "").trim().toLowerCase() !== "meta") {
    return;
  }

  const token = String(process.env.WHATSAPP_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const adminTo = String(process.env.WHATSAPP_ADMIN_TO || "").trim();

  if (!token || !phoneNumberId || !adminTo) {
    return;
  }

  const payload = buildWhatsAppPayload({
    code,
    extensionId,
    reason,
    expiresAt,
    recipientEmail,
    adminTo
  });

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const bodyText = await response.text();
      console.error("whatsapp_alert_failed", response.status, bodyText);
    }
  } catch (error) {
    console.error("whatsapp_alert_failed", error instanceof Error ? error.message : String(error));
  }
}

function buildWhatsAppPayload({
  code,
  extensionId,
  reason,
  expiresAt,
  recipientEmail,
  adminTo
}) {
  const templateName = String(process.env.WHATSAPP_TEMPLATE_NAME || "").trim();

  if (templateName) {
    return {
      messaging_product: "whatsapp",
      to: adminTo,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: String(process.env.WHATSAPP_TEMPLATE_LANGUAGE || "pt_BR").trim()
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: extensionId },
              { type: "text", text: recipientEmail },
              { type: "text", text: code },
              { type: "text", text: reason },
              { type: "text", text: new Date(expiresAt).toISOString() }
            ]
          }
        ]
      }
    };
  }

  return {
    messaging_product: "whatsapp",
    to: adminTo,
    type: "text",
    text: {
      preview_url: false,
      body: buildWhatsAppAlertMessage({
        code,
        extensionId,
        reason,
        expiresAt,
        recipientEmail
      })
    }
  };
}
