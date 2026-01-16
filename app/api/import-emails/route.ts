import { NextResponse } from "next/server";

function isValidEmail(email: string) {
  // validação simples (boa o suficiente pra limpeza inicial)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Arquivo .txt não enviado" }, { status: 400 });
    }

    const text = await file.text();

    const raw = text
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);

    // remove lixo comum
    const cleaned = raw
      .map((e) => e.replace(/^mailto:/, ""))
      .map((e) => e.replace(/[,;]$/, "")); // caso tenha vírgula/ponto e vírgula no fim

    const valid = cleaned.filter(isValidEmail);

    // dedupe
    const unique = Array.from(new Set(valid));

    return NextResponse.json({
      ok: true,
      totalLinhas: raw.length,
      validos: valid.length,
      unicos: unique.length,
      preview: unique.slice(0, 25),
      // Aqui você decide: salvar em DB/KV ou só retornar.
    });
  } catch (err: any) {
    console.error("import-emails error:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}
