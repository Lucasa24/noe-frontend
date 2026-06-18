module.exports = async (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "browser-read-any-site",
    smtpConfigured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
    signingConfigured: Boolean(process.env.SIGNING_SECRET),
    tokenConfigured: Boolean(process.env.WEBHOOK_TOKEN),
    ttlMinutes: Number(process.env.CODE_TTL_MINUTES || 10)
  });
};
