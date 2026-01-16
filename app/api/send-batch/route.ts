import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

type Body = {
  blobDedupUrl: string;   // url do JSON do blob (private ainda funciona via fetch no server)
  start: number;          // offset (ex: 0, 100, 200...)
  limit: number;          // tamanho do lote (ex: 100)
  subject: string;
  html?: string;
  text?: string;
};

function getTransport() {
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER!;
  const pass = process.env.SMTP_PASS!;
  const from = process.env.MAIL_FROM!; // ex: "Caixa DVD <caixa@seudominio.com>"

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = true, 587 = false
    auth: { user, pass },
  });

  return { transporter, from };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body.blobDedupUrl || !body.subject) {
      return NextResponse.json({ ok: false, error: "Campos obrigatórios faltando." }, { status: 400 });
    }

    // busca lista deduplicada
    const r = await fetch(body.blobDedupUrl);
    if (!r.ok) throw new Error(`Falha ao baixar lista do Blob: ${r.status}`);
    const data = await r.json();
    const emails: string[] = data.emails || [];

    const start = Math.max(0, body.start || 0);
    const limit = Math.min(Math.max(1, body.limit || 50), 200); // trava no máx 200
    const slice = emails.slice(start, start + limit);

    const { transporter, from } = getTransport();

    let sent = 0;
    const errors: Array<{ email: string; error: string }> = [];

    // envio sequencial (mais seguro). Se quiser, dá pra fazer concorrência baixa (2-5).
    for (const to of slice) {
      try {
        await transporter.sendMail({
          from,
          to,
          subject: body.subject,
          html: body.html,
          text: body.text,
          // recomendável ter um List-Unsubscribe real no futuro
        });
        sent++;
      } catch (e: any) {
        errors.push({ email: to, error: e?.message || "send error" });
      }
    }

    return NextResponse.json({
      ok: true,
      totalLista: emails.length,
      start,
      limit,
      attempted: slice.length,
      sent,
      failed: errors.length,
      errors: errors.slice(0, 10), // não explode o payload
      nextStart: start + limit,
      hasMore: start + limit < emails.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro no envio em lote" },
      { status: 500 }
    );
  }
}
