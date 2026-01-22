import { NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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
         values ($1,'pending',$2,$3)
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
         values ($1,'subscribe', jsonb_build_object('source',$2))`,
        [email, source]
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // debug_token só pra teste. Depois a gente remove e manda por email.
    return json({ ok: true, message: "Salvo como pending", debug_token: token }, 200);
  } catch {
    return json({ ok: false, error: "Erro interno" }, 500);
  }
}
