// app/api/import-emails/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

function extractEmails(text: string) {
  // pega emails em qualquer lugar do texto
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return matches.map((e) => e.trim().toLowerCase());
}

function isValidEmail(e: string) {
  // validação básica
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export const runtime = "nodejs"; // nodemailer/smtp precisa Node runtime

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Envie um arquivo no campo 'file' (multipart/form-data)." },
        { status: 400 }
      );
    }

    const rawText = await file.text();
    const all = extractEmails(rawText);

    const valid = all.filter(isValidEmail);
    const uniqueSet = new Set(valid);
    const unique = Array.from(uniqueSet);

    const dedupText = unique.join("\n") + "\n";

    // salva no Vercel Blob
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `imports/emails-${ts}-dedup.txt`;

    const blob = await put(key, dedupText, {
      access: "public", // melhor prática
      contentType: "text/plain; charset=utf-8",
      addRandomSuffix: false,
    });

    return NextResponse.json({
      ok: true,
      totalLinhas: rawText.split(/\r?\n/).filter(Boolean).length,
      encontrados: all.length,
      validos: valid.length,
      unicos: unique.length,
      blobDedupUrl: blob.url,
      preview: unique.slice(0, 10),
    });
    } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro desconhecido" },
      { status: 500 }
    );
  }
}
