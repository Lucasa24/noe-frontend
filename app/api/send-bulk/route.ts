import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { loadSuppressionSet, addManyToSuppression } from "@/lib/suppression";

type Body = {
  blobUrl: string;        // blobDedupUrl que você recebeu do import
  subject: string;
  html?: string;
  text?: string;
  from?: string;          // opcional; senão usa EMAIL_FROM do env
  start?: number;         // índice inicial (0, 50, 100...)
  batchSize?: number;     // ex: 50
  concurrency?: number;   // ex: 3
  dryRun?: boolean;       // true = não envia, só simula
};

function parseEmailsFromTxt(txt: string) {
  return txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function sendOneEmail(params: {
  transporter: nodemailer.Transporter;
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  const { transporter, ...mail } = params;
  return transporter.sendMail({
    ...mail,
    // boa prática mínima
    headers: {
      "X-Entity-Ref-ID": "noe-frontend-bulk",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const blobUrl = body.blobUrl;
    if (!blobUrl) {
      return NextResponse.json({ ok: false, error: "blobUrl é obrigatório" }, { status: 400 });
    }

    const subject = body.subject?.trim();
    if (!subject) {
      return NextResponse.json({ ok: false, error: "subject é obrigatório" }, { status: 400 });
    }

    const batchSize = Math.max(1, Math.min(body.batchSize ?? 50, 200)); // 1..200
    const start = Math.max(0, body.start ?? 0);
    const concurrency = Math.max(1, Math.min(body.concurrency ?? 3, 10));
    const dryRun = !!body.dryRun;

    const from = (body.from ?? process.env.EMAIL_FROM ?? "").trim();
    if (!from) {
      return NextResponse.json({ ok: false, error: "Defina EMAIL_FROM no env ou envie 'from' no body" }, { status: 400 });
    }

    // 1) baixar o txt do blob
    const res = await fetch(blobUrl);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Falha ao baixar blob: ${res.status}` }, { status: 400 });
    }
    const txt = await res.text();
const emails = parseEmailsFromTxt(txt);

// B) Filtrar suppression ANTES do slice
const suppression = await loadSuppressionSet();
const filteredAll = emails.filter((e) => !suppression.has(e.trim().toLowerCase()));

const total = filteredAll.length;
const slice = filteredAll.slice(start, start + batchSize);

    if (slice.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        total,
        start,
        batchSize,
        sent: 0,
        failed: 0,
        nextStart: start,
        message: "Nada para enviar (fim da lista).",
      });
    }

    // 2) configurar SMTP (SES)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false, // 587 STARTTLS
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const html = body.html;
    const text = body.text ?? (html ? undefined : ""); // se não mandar nada, evita undefined

    // 3) enviar com “concurrency” limitada
    let sent = 0;
    let failed = 0;
    const errors: Array<{ to: string; error: string }> = [];

    const queue = [...slice];

    async function worker() {
      while (queue.length) {
        const to = queue.shift()!;
        try {
          if (!dryRun) {
            await sendOneEmail({ transporter, from, to, subject, html, text });
          }
          sent++;
        } catch (e: any) {
          failed++;
          errors.push({ to, error: e?.message ?? String(e) });
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const nextStart = start + slice.length;
    const done = nextStart >= total;

function looksPermanentFailure(errMsg: string) {
  const m = (errMsg || "").toLowerCase();
  return (
    m.includes("mailbox does not exist") ||
    m.includes("user unknown") ||
    m.includes("no such user") ||
    m.includes("invalid recipient") ||
    m.includes("address does not exist") ||
    m.includes("unknown recipient") ||
    m.includes("550") ||
    m.includes("553")
  );
}

const hardBounced: string[] = [];
for (const e of errors) {
  const to = (e?.to || "").trim().toLowerCase();
  const msg = String(e?.error || "");
  if (to && looksPermanentFailure(msg)) hardBounced.push(to);
}

if (hardBounced.length > 0) {
  await addManyToSuppression(hardBounced);
}
    
    return NextResponse.json({
      ok: true,
      dryRun,
      total,
      start,
      batchSize,
      processed: slice.length,
      sent,
      failed,
      done,
      nextStart,
      // devolve só os primeiros erros pra não explodir resposta
      errorsPreview: errors.slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}


