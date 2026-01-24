import { NextResponse } from "next/server";
import { Pool } from "pg";
import { Webhook } from "svix";

export const runtime = "nodejs";

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pickFirstEmail(value: any): string {
  // tenta cobrir formatos comuns: string, array, objetos
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return "";
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const db = process.env.DATABASE_URL;

  if (!secret) return json({ ok: false, error: "RESEND_WEBHOOK_SECRET missing" }, 500);
  if (!db) return json({ ok: false, error: "DATABASE_URL missing" }, 500);

  // 1) RAW body é obrigatório pra validar assinatura
  const payload = await req.text();

  // 2) Svix headers (Resend usa esse padrão)
  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    // Não vaza detalhes demais.
    return json({ ok: false, error: "Missing webhook headers" }, 400);
  }

  // 3) Verifica assinatura
  let event: any;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch {
    return json({ ok: false, error: "Invalid signature" }, 401);
  }

  // 4) Extrai tipo e dados
  const eventType = String(event?.type || "").toLowerCase();
  const data = event?.data || event?.payload || {};

  // 5) Extrai email (Resend pode variar o formato)
  const emailRaw =
    pickFirstEmail(data?.to) ||
    pickFirstEmail(data?.recipient) ||
    pickFirstEmail(data?.email) ||
    pickFirstEmail(data?.contact?.email) ||
    pickFirstEmail(data?.user?.email) ||
    pickFirstEmail(data?.recipients);

  const email = normalizeEmail(emailRaw);

  // 6) Decide se deve suprimir
  const shouldSuppress =
    eventType.includes("bounced") ||
    eventType.includes("bounce") ||
    eventType.includes("complained") ||
    eventType.includes("complaint");

  const pool = new Pool({
    connectionString: db,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Sempre loga o webhook recebido (audit trail)
    await client.query(
      `insert into public.events(email, event_type, payload)
       values ($1::text, $2::text, $3::jsonb)`,
      [email || "", `resend_${eventType}`, JSON.stringify(event)]
    );

    // Bounce/Complaint => SUPPRESSED (blindado)
if (shouldSuppress && email) {
  // UPSERT: se existe, vira suppressed; se não existe, cria suppressed
  await client.query(
    `insert into public.subscribers (email, status, source)
     values ($1::text, 'suppressed', 'resend')
     on conflict (email) do update
       set status = 'suppressed'`,
    [email]
  );

  await client.query(
    `insert into public.events(email, event_type, payload)
     values ($1::text, 'suppressed', jsonb_build_object('reason',$2::text,'provider','resend'))`,
    [email, eventType]
  );
}

    await client.query("COMMIT");

    // Resend precisa de 2xx pra considerar entregue (e não re-tentar)
    return json({ ok: true }, 200);
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("RESEND_WEBHOOK_ERROR_MESSAGE:", e?.message);
    console.error("RESEND_WEBHOOK_ERROR_STACK:", e?.stack);
    console.error("RESEND_WEBHOOK_ERROR_FULL:", e);

    // Ainda retorno 200 em alguns casos? NÃO. Aqui eu quero ver erro e re-tentativa é útil.
    return json({ ok: false, error: String(e?.message || e) }, 500);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}
