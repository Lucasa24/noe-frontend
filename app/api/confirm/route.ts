import { NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";

export const runtime = "nodejs";

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function getClientIp(req: Request) {
  // Vercel / proxies
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  );
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

// GET /api/confirm?token=...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").trim();

  return confirmToken(req, token, /*redirect*/ true);
}

// POST { token: "..." }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();

  return confirmToken(req, token, /*redirect*/ false);
}

async function confirmToken(req: Request, token: string, redirect: boolean) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing in env");
    return json({ ok: false, error: "DATABASE_URL missing" }, 500);
  }

  if (!token || token.length < 20) {
    // token hex de 32 bytes tem 64 chars; mas deixo margem
    return finalizeResponse(
      { ok: false, error: "Token inválido" },
      400,
      redirect
    );
  }

  const tokenHash = sha256Hex(token);
  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) buscar assinatura do token
    const found = await client.query(
      `select email, status
       from public.subscribers
       where token_hash = $1::text
       limit 1`,
      [tokenHash]
    );

    if (!found.rowCount) {
      // loga tentativa inválida (sem email)
      await client.query(
        `insert into public.events(email, event_type, payload)
         values ($1::text,'confirm_invalid', jsonb_build_object('reason','token_not_found','ip',$2::text,'ua',$3::text))`,
        ["", String(ip ?? ""), String(ua ?? "")]
      );

      await client.query("COMMIT");
      return finalizeResponse(
        { ok: false, error: "Token inválido ou expirado" },
        400,
        redirect
      );
    }

    const email = String(found.rows[0].email || "");
    const status = String(found.rows[0].status || "");

    if (status === "suppressed") {
      await client.query(
        `insert into public.events(email, event_type, payload)
         values ($1::text,'confirm_blocked', jsonb_build_object('reason','suppressed','ip',$2::text,'ua',$3::text))`,
        [email, String(ip ?? ""), String(ua ?? "")]
      );

      await client.query("COMMIT");
      return finalizeResponse(
        { ok: true, message: "Confirmado (se aplicável)." },
        200,
        redirect
      );
    }

    // 2) idempotência: se já confirmado, não quebra
    if (status === "confirmed") {
      await client.query(
        `insert into public.events(email, event_type, payload)
         values ($1::text,'confirm_repeat', jsonb_build_object('ip',$2::text,'ua',$3::text))`,
        [email, String(ip ?? ""), String(ua ?? "")]
      );

      await client.query("COMMIT");
      return finalizeResponse(
        { ok: true, message: "Email já confirmado." },
        200,
        redirect
      );
    }

    // 3) confirma (e zera token_hash pra impedir reuso)
    const updated = await client.query(
      `update public.subscribers
         set status = 'confirmed',
             confirmed_at = now(),
             confirm_ip = $2::text,
             confirm_ua = $3::text,
             token_hash = null
       where token_hash = $1::text
       returning email`,
      [tokenHash, String(ip ?? ""), String(ua ?? "")]
    );

    // (por segurança) se não atualizou, trata como inválido/expirado
    if (!updated.rowCount) {
      await client.query("COMMIT");
      return finalizeResponse(
        { ok: false, error: "Token inválido ou já utilizado" },
        400,
        redirect
      );
    }

    await client.query(
      `insert into public.events(email, event_type, payload)
       values ($1::text,'confirm', jsonb_build_object('ip',$2::text,'ua',$3::text))`,
      [email, String(ip ?? ""), String(ua ?? "")]
    );

    await client.query("COMMIT");

    return finalizeResponse(
      { ok: true, message: "Email confirmado com sucesso." },
      200,
      redirect
    );
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CONFIRM_ERROR_MESSAGE:", err?.message);
    console.error("CONFIRM_ERROR_STACK:", err?.stack);
    console.error("CONFIRM_ERROR_FULL:", err);
    return json({ ok: false, error: String(err?.message || err) }, 500);
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

function finalizeResponse(body: any, status: number, redirect: boolean) {
  if (!redirect) return json(body, status);

  // Se você tiver uma página no front tipo /confirm-result, manda pra lá
  // Ajuste APP_URL no env (ex: https://noe-frontend.vercel.app)
  const base = process.env.APP_URL?.trim();
  if (!base) return json(body, status);

  const url = new URL("/confirm-result", base);
  url.searchParams.set("ok", body.ok ? "1" : "0");
  if (body.message) url.searchParams.set("message", body.message);
  if (body.error) url.searchParams.set("error", body.error);

  return NextResponse.redirect(url, { status: 302 });
}
