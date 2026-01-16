import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const { to, subject, html } = await req.json();

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
    const from = process.env.FROM_EMAIL;

    if (!host || !user || !pass || !from) {
      return NextResponse.json(
        { ok: false, error: "Env vars faltando: SMTP_HOST/SMTP_USER/SMTP_PASS/FROM_EMAIL" },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = SSL direto, 587 = STARTTLS
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Erro ao enviar email:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno" },
      { status: 500 }
    );
  }
}