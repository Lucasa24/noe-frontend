"use strict";
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");

// Codigo ADMINISTRATIVO do PIXEL AI HUB, separado do OTP usado para entrar no curso.
// O email nunca e fornecido pelo cliente.
const ADMIN_EMAIL = "lucasalvarezempresa@gmail.com";
const PURPOSE = "pixel-ai-hub-admin-maintenance-v1";
const TTL_MS = 5 * 60 * 1000;

module.exports = async function maintenanceCodeHandler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    authorize(req);
    const input = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const extensionId = String(input.extensionId || "").trim();
    // AdsPower pode alterar o ID da instalacao. O email administrativo continua
    // sendo o segundo fator, independentemente do ID; exigir formato valido.
    if (!/^[a-p]{32}$/.test(extensionId)) fail("invalid_extension_id", 400);
    if (input.action === "request") {
      ensureSMTP();
      const code = String(crypto.randomInt(0, 100000000)).padStart(8, "0");
      const issuedAt = Date.now();
      const expiresAt = issuedAt + TTL_MS;
      const challengeToken = sign({
        purpose: PURPOSE, extensionId, expiresAt, issuedAt,
        nonce: crypto.randomUUID(), codeHash: hash(code)
      });
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE || "true") === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to: ADMIN_EMAIL,
        subject: code + " — Autorizacao administrativa PIXEL AI HUB",
        text: [
          "Um pedido para liberar temporariamente a navegacao do Browser Read foi realizado.",
          "",
          "Codigo administrativo: " + code,
          "Validade: 5 minutos.",
          "Este codigo libera todos os dominios SOMENTE apos confirmacao na pagina de manutencao.",
          "Nao compartilhe o codigo. Se nao solicitou, ignore este email."
        ].join("\n"),
        html: "<p>Ativação de manutenção do Browser Read - PIXEL AI HUB.</p>" +
          "<p><strong style=\"font-size:25px;letter-spacing:3px\">" + code + "</strong></p>" +
          "<p>Válido por 5 minutos. Se não solicitou, ignore.</p>"
      });
      return res.status(200).json({ ok: true, challengeToken, expiresAt });
    }
    if (input.action === "verify") {
      const code = String(input.code || "").trim();
      if (!/^\d{8}$/.test(code)) fail("invalid_code", 400);
      const payload = unsign(String(input.challengeToken || ""));
      if (payload.purpose !== PURPOSE || payload.extensionId !== extensionId) fail("invalid_challenge", 400);
      if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < Date.now()) fail("code_expired", 400);
      if (!Number.isSafeInteger(payload.issuedAt) || payload.issuedAt > Date.now() + 60000 ||
          payload.expiresAt - payload.issuedAt > TTL_MS + 10000) fail("invalid_challenge", 400);
      if (!timingEqual(hash(code), payload.codeHash)) fail("invalid_code", 400);
      return res.status(200).json({ ok: true, verified: true });
    }
    return res.status(400).json({ ok: false, error: "invalid_action" });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    console.error("pixel_maintenance_endpoint", status, error?.message || "unknown");
    return res.status(status).json({ ok: false,
      error: status >= 500 ? "maintenance_server_unavailable" : error.message });
  }
};

function authorize(req) {
  const secret = String(process.env.WEBHOOK_TOKEN || "");
  const provided = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ""))?.[1] || "";
  if (!secret || !timingEqual(secret, provided)) fail("unauthorized", 401);
  if (!process.env.SIGNING_SECRET || String(process.env.SIGNING_SECRET).length < 16)
    fail("signing_not_configured", 503);
}
function ensureSMTP() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) fail("smtp_not_configured", 503);
}
function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function mac(encoded) {
  return crypto.createHmac("sha256", process.env.SIGNING_SECRET).update(encoded).digest("base64url");
}
function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return encoded + "." + mac(encoded);
}
function unsign(token) {
  if (token.length > 2000) fail("invalid_challenge", 400);
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
      !timingEqual(parts[1], mac(parts[0]))) fail("invalid_challenge", 400);
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch (_) { fail("invalid_challenge", 400); }
}
function timingEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function fail(message, statusCode) {
  const error = new Error(message); error.statusCode = statusCode; throw error;
}
