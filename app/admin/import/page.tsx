"use client";

import { useState } from "react";

export default function ImportEmailsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return;

    setLoading(true);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/import-emails", {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1>Importar emails (.txt)</h1>

      <p>Formato: 1 email por linha.</p>

      <input
        type="file"
        accept=".txt"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div style={{ marginTop: 12 }}>
        <button disabled={!file || loading} onClick={handleUpload}>
          {loading ? "Importando..." : "Importar"}
        </button>
      </div>

      {result && (
        <pre style={{ marginTop: 16, background: "#111", color: "#0f0", padding: 12 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
