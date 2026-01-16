import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

function extractEmails(text: string) {
  // pega emails, normaliza, remove duplicados
  const matches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  const cleaned = matches
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length <= 254);

  const unique = Array.from(new Set(cleaned));
  return { total: matches.length, unique };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Envie um arquivo no campo 'file' (multipart/form-data)." },
        { status: 400 }
      );
    }

    const text = await file.text();
    const { total, unique } = extractEmails(text);

    // Salva o TXT ORIGINAL (opcional)
    const originalUpload = await put(
      `email-lists/${Date.now()}-${file.name || "emails"}.txt`,
      text,
      { access: "private", contentType: "text/plain; charset=utf-8" }
    );

    // Salva também a lista deduplicada em JSON (facilita envio)
    const dedupUpload = await put(
      `email-lists/${Date.now()}-dedup.json`,
      JSON.stringify({ emails: unique }, null, 2),
      { access: "private", contentType: "application/json; charset=utf-8" }
    );

    return NextResponse.json({
      ok: true,
      totalEncontrados: total,
      unicos: unique.length,
      preview: unique.slice(0, 20),
      blobOriginalUrl: originalUpload.url,
      blobDedupUrl: dedupUpload.url,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro ao importar lista" },
      { status: 500 }
    );
  }
}
