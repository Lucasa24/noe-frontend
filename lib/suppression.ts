import { put } from "@vercel/blob";

/**
 * Normaliza email para evitar duplicações
 */
function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Carrega a lista de supressão (unsubscribe + hard bounce)
 * Retorna um Set<string> para lookup rápido
 */
export async function loadSuppressionSet(): Promise<Set<string>> {
  const url = process.env.SUPPRESSION_BLOB_URL;

  // Ainda não existe lista de supressão
  if (!url) {
    return new Set();
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return new Set();
  }

  const text = await res.text();
  const set = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const email = line.trim();
    if (email) {
      set.add(normalizeEmail(email));
    }
  }

  return set;
}

/**
 * Salva a lista de supressão no Blob
 * Sempre sobrescreve o mesmo arquivo
 */
async function saveSuppressionSet(set: Set<string>) {
  const pathname =
    process.env.SUPPRESSION_PATHNAME || "suppression/suppression.txt";

  const content =
    Array.from(set)
      .sort()
      .join("\n") + "\n";

  const blob = await put(pathname, content, {
    access: "public",
    addRandomSuffix: false,
  });

  return blob.url;
}

/**
 * Adiciona um email à lista de supressão
 * Usado por unsubscribe e hard bounce
 */
export async function addToSuppression(email: string) {
  const normalized = normalizeEmail(email);

  const set = await loadSuppressionSet();
  set.add(normalized);

  const url = await saveSuppressionSet(set);

  return {
    ok: true,
    suppressed: normalized,
    total: set.size,
    url,
  };
}
