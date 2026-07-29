const { listRecipientsForExtension } = require("../lib/access-service");
const { getRecipientActivity } = require("../lib/recipient-activity");

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

    const body = normalizeBody(req.body);
    const extensionId = String(body.extensionId || "").trim();

    if (!extensionId) {
      res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
      return;
    }

    const recipients = listRecipientsForExtension(extensionId);
    let activityByRecipient = {};

    try {
      activityByRecipient = await getRecipientActivity(
        extensionId,
        recipients.map((recipient) => recipient.key)
      );
    } catch (error) {
      // A indisponibilidade temporária do histórico não pode impedir a
      // escolha nem o envio do código.
      console.error("recipient_activity_list_failed", error instanceof Error ? error.message : String(error));
    }
    const recipientsWithActivity = recipients.map((recipient) => ({
      ...recipient,
      lastSentAt: activityByRecipient[recipient.key] || null
    }));

    res.status(200).json({
      ok: true,
      recipients: recipientsWithActivity
    });
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({
      ok: false,
      error: error instanceof Error ? error.message : "recipients_failed"
    });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
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
