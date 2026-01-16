import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

// email regex simples (boa o suficiente pra filtrar lixo)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Envie um arquivo em form-data com o campo 'file'." },
        { status: 400 }
      );
    }

    const text = await file.text();

    // aceita: 1 email por linha (e ignora linhas vazias)
    const lines = text.split(/\r?\n/g);

    const cleaned = lines
      .map(normalizeEmail)
      .filter(Boolean)
      .filter((e) => EMAIL_RE.test(e));

    // dedup
    const unique = Array.from(new Set(cleaned));

    if (unique.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum email válido encontrado." }, { status: 400 });
    }

    // monta conteúdo final (1 email por linha)
    const out = unique.join("\n") + "\n";

    // salva no Blob (PRIVATE por padrão)
    const key = `lists/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;

    const blob = await put(key, out, {
      access: "private",
      contentType: "text/plain; charset=utf-8",
    });

    return NextResponse.json({
      ok: true,
      listId: blob.pathname, // <<< ISSO é o que você guarda
      total: cleaned.length,
      unique: unique.length,
      removedDuplicates: cleaned.length - unique.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro interno" },
      { status: 500 }
    );
  }
}
