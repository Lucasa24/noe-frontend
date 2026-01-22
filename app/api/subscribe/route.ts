<<<<<<< HEAD
import { NextResponse } from "next/server";

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
    const source = String(body.source || "manual-test");

    if (!email) {
      return json({ ok: false, error: "Email ausente" }, 400);
    }

    return json(
      { ok: true, message: "POST funcionando", email, source },
      200
    );
  } catch {
    return json({ ok: false, error: "Erro interno" }, 500);
  }
}
=======
import { NextResponse } from "next/server";

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
    const source = String(body.source || "manual-test");

    if (!email) {
      return json({ ok: false, error: "Email ausente" }, 400);
    }

    return json(
      { ok: true, message: "POST funcionando", email, source },
      200
    );
  } catch {
    return json({ ok: false, error: "Erro interno" }, 500);
  }
}
