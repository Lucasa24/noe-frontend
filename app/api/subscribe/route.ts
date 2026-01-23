import { NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  // ALARME (primeira coisa)
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing in env");
    return json({ ok: false, error: "DATABASE_URL missing" }, 500);
  }

  // cria o pool aqui dentro pra não explodir build/edge e facilitar debug
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const source = String(body.source || "manual-test").slice(0, 120);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ ok: false, error: "Email inválido" }, 400);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `select status from public.subscribers where email=$1 limit 1`,
        [email]
      );

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
    } catch (e: any) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end().catch(() => {});
    }

    // debug_token só pra teste. Depois remove e manda por email.
    return json(
  { ok: true, message: "Se este email estiver apto, você receberá instruções para confirmar." },
  200
);
  } catch (err: any) {
    console.error("SUBSCRIBE_ERROR_MESSAGE:", err?.message);
    console.error("SUBSCRIBE_ERROR_STACK:", err?.stack);
    console.error("SUBSCRIBE_ERROR_FULL:", err);

    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
}
