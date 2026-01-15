import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs"; // importante pra garantir Node runtime (SMTP)

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Body inválido (JSON)" },
        { status: 400 }
      );
    }

    const { to, subject, html } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { ok: false, error: "Campos obrigatórios: to, subject, html" },
        { status: 400 }
      );
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.MAIL_FROM;

    if (!host || !user || !pass || !from) {
      return NextResponse.json(
        { ok: false, error: "Env vars faltando (SMTP_HOST/USER/PASS/MAIL_FROM)" },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    return NextResponse.json({ ok: true, messageId: info.messageId });
  } catch (err: any) {
    console.error("Erro ao enviar email:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno" },
      { status: 500 }
    );
  }
}
