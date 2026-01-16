import { NextResponse } from "next/server";
import { addToSuppression } from "@/lib/suppression";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = (searchParams.get("email") || "").trim();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Email inválido. Use /api/unsubscribe?email=seu@email.com" },
      { status: 400 }
    );
  }

  const result = await addToSuppression(email);

  // Isso aqui é o "URL retornado" que eu falei.
  // Copie o `result.url` e salve na Vercel como SUPPRESSION_BLOB_URL.
  return new NextResponse(
    `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Unsubscribe</title></head>
  <body style="font-family: Arial, sans-serif; padding: 24px;">
    <h2>Pronto.</h2>
    <p><b>${result.suppressed}</b> foi removido da lista.</p>
    <p>Total na suppression list: <b>${result.total}</b></p>
    <p style="margin-top:16px;color:#555">
      SUPPRESSION_BLOB_URL (copie isso e cole na Vercel):
      <br/>
      <code>${result.url}</code>
    </p>
  </body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}