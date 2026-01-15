import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, subject, html } = body;

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Campos obrigatórios: to, subject, html" },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SES_SMTP_HOST, // ex: email-smtp.us-east-1.amazonaws.com
      port: 587,
      secure: false,
      auth: {
        user: process.env.SES_SMTP_USER,
        pass: process.env.SES_SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"MentorX Lab" <no-reply@mentorxlab.com>`,
      to,
      subject,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao enviar email:", error);

    return NextResponse.json(
      { error: "Erro interno ao enviar email" },
      { status: 500 }
    );
  }
}
