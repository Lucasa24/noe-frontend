import { NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";
import { Resend } from "resend";

export const runtime = "nodejs";

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      ...(process.env.WORDPRESS_ORIGIN
        ? { "Access-Control-Allow-Origin": process.env.WORDPRESS_ORIGIN }
        : {}),
    },
  });
}

export async function OPTIONS() {
  return json({ ok: true }, 200);
}

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing in env");
    return json({ ok: false, error: "DATABASE_URL missing" }, 500);
  }

  if (!process.env.APP_URL) {
    console.error("APP_URL is missing in env");
    return json({ ok: false, error: "APP_URL missing" }, 500);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  const ip = getClientIp(req);
const rlKey = `ip:${ip}`;
const windowStart = minuteWindowStart();
const MAX_PER_MINUTE = 5;

const rl = await client.query(
  `
  insert into public.rate_limits(key, window_start, count)
  values ($1::text, $2::timestamptz, 1)
  on conflict (key, window_start)
  do update
    set count = public.rate_limits.count + 1,
        updated_at = now()
  returning count;
  `,
  [rlKey, windowStart]
);

const currentCount = rl.rows?.[0]?.count ?? 1;

if (currentCount > MAX_PER_MINUTE) {
  await client.query(
    `insert into public.events(email, event_type, payload)
     values ($1::text,'rate_limited',
       jsonb_build_object('ip',$2::text,'count',$3::int,'window',$4::text)
     )`,
    ["", String(ip), Number(currentCount), String(windowStart)]
  );

  await client.query("COMMIT");

  return json(
    { ok: true, message: "Se este email estiver apto, você receberá instruções." },
    200
  );
}

  function getClientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

function minuteWindowStart() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
}

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const source = String(body.source || "manual-test").slice(0, 120);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "Email inválido" }, 400);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const confirmUrl = new URL("/confirm/", process.env.APP_URL);
    confirmUrl.searchParams.set("token", token);

    await client.query("BEGIN");

    const existing = await client.query(
      `select status from public.subscribers where email=$1 limit 1`,
      [email]
    );

    // 1) SUPPRESSED → NÃO ENVIA EMAIL
    if (existing.rowCount && existing.rows[0].status === "suppressed") {
      await client.query(
        `insert into public.events(email, event_type, payload)
         values ($1,'subscribe_blocked', jsonb_build_object('reason','suppressed','source',$2))`,
        [email, source]
      );

      await client.query("COMMIT");

      return json(
        { ok: true, message: "Se este email estiver apto, você receberá instruções." },
        200
      );
    }

    // 2) NORMAL → SALVA PENDING
    await client.query(
      `insert into public.subscribers(email, status, token_hash, source)
       values ($1::text,'pending',$2::text,$3::text)
       on conflict (email) do update
         set status='pending',
             token_hash=excluded.token_hash,
             source=excluded.source,
             created_at=now(),
             confirmed_at=null,
             confirm_ip=null,
             confirm_ua=null`,
      [email, tokenHash, source]
    );

    await client.query(
      `insert into public.events(email, event_type, payload)
       values ($1::text,'subscribe', jsonb_build_object('source',$2::text))`,
      [email, source]
    );

    await client.query("COMMIT");

    // 3) ENVIA EMAIL (APÓS COMMIT)
    if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
    if (!process.env.EMAIL_FROM) throw new Error("EMAIL_FROM missing");

    const resend = new Resend(process.env.RESEND_API_KEY);

    const sendResult = await resend.emails.send({
      from: process.env.EMAIL_FROM, // MentorXLab <no-reply@mentorxlab.com>
      to: email,
      replyTo: "caixa@mentorxlab.com",
      subject: "A caixa te reconheceu",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto;">
          <h2>Você pediu acesso à Caixa</h2>
          <p>Ela não se abre sozinha.
E não se abre para curiosos.

Para confirmar que é você, clique no link abaixo:</p>
          <p style="margin: 24px 0;">
            <a href="${confirmUrl.toString()}"
               style="display:inline-block;padding:12px 20px;background:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">
              → Confirmar acesso
            </a>
          </p>
          <p style="font-size:12px; color:#666;">
            Depois disso, o acesso não volta para cá.
Ele segue com você.

Se esse e-mail não fizer sentido agora, basta ignorar.
Nada acontece.
          </p>
        </div>
      `,
    });

    console.log("RESEND_SEND_RESULT:", sendResult);

    return json(
      { ok: true, message: "Se este email estiver apto, você receberá instruções para confirmar." },
      200
    );
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("SUBSCRIBE_ERROR_MESSAGE:", e?.message);
    console.error("SUBSCRIBE_ERROR_STACK:", e?.stack);
    console.error("SUBSCRIBE_ERROR_FULL:", e);

    return json({ ok: false, error: String(e?.message || e) }, 500);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}
