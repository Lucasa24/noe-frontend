"use client"; 
 
 import { useState } from "react"; 
 
 export default function Home() { 
   const [input, setInput] = useState(""); 
   const [out, setOut] = useState(""); 
   const [loading, setLoading] = useState(false); 
   const [debugInfo, setDebugInfo] = useState(""); 
 
   async function send() { 
     setLoading(true); 
     setOut(""); 
     setDebugInfo(""); 
 
     try { 
       const res = await fetch("/api/noe/stream", { 
         method: "POST", 
         headers: { "Content-Type": "application/json" }, 
         body: JSON.stringify({ message: input }), 
       }); 
 
       if (!res.body) { 
         setOut("Erro: stream não veio."); 
         setLoading(false); 
         return; 
       } 
 
       const reader = res.body.getReader(); 
       const decoder = new TextDecoder(); 
 
       let buf = ""; 
 
       while (true) { 
         const { value, done } = await reader.read(); 
         if (done) break; 
 
         const chunk = decoder.decode(value, { stream: true }); 
         buf += chunk; 
         
         // Debug: mostrar o que está chegando cru 
         setDebugInfo((prev) => (prev + chunk).slice(-1000)); 
 
         // Eventos SSE são separados por "\n\n" 
         const parts = buf.split("\n\n"); 
         buf = parts.pop() || ""; 
 
         for (const part of parts) { 
           const lines = part.split("\n").map((l) => l.trim()); 
 
           // Se for um evento do tipo "event: done", ignore 
           const eventLine = lines.find((l) => l.startsWith("event:")); 
           if (eventLine && !lines.some((l) => l.startsWith("data:"))) continue; 
 
           const dataLine = lines.find((l) => l.startsWith("data:")); 
           if (!dataLine) continue; 
 
           const payload = dataLine.slice(5).trim(); 
 
           // IGNORA mensagens simples (o que está te quebrando) 
           if (!payload || payload === "ok") continue; 
 
           // Alguns SSE mandam "[DONE]" etc. 
           if (payload === "[DONE]") continue; 
 
           // Agora sim: token JSON 
           try { 
             const token = JSON.parse(payload) as string; 
             setOut((prev) => prev + token); 
           } catch (err: any) { 
             console.error("CRASH EVITADO:", payload, err); 
             setOut((prev) => prev + `\n[ERRO PARSE: "${payload}"]\n`); 
             continue; 
           } 
         } 
       } 
     } catch (err: any) { 
       setOut((prev) => prev + `\n[ERRO GERAL: ${err.message}]\n`); 
     } finally { 
       setLoading(false); 
     } 
   } 
 
   return ( 
     <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800 }}> 
       <h1>Nóe (teste streaming v2 - Debug)</h1> 
 
       <div 
         style={{ 
           marginTop: 16, 
           padding: 16, 
           border: "1px solid #ddd", 
           minHeight: 120, 
           whiteSpace: "pre-wrap", 
         }} 
       > 
         {out || "Digite algo e clique em Enviar…"} 
       </div> 
 
       {/* Área de Debug */} 
       <div style={{ marginTop: 20, background: "#f0f0f0", padding: 10, borderRadius: 5 }}> 
         <h3>Últimos dados recebidos (RAW):</h3> 
         <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "#333" }}> 
           {debugInfo || "Nenhum dado recebido ainda..."} 
         </pre> 
       </div> 
 
       <div style={{ marginTop: 16, display: "flex", gap: 8 }}> 
         <input 
           value={input} 
           onChange={(e) => setInput(e.target.value)} 
           placeholder="Fale com o Nóe…" 
           style={{ flex: 1, padding: 10 }} 
         /> 
         <button onClick={send} disabled={loading || !input.trim()}> 
           {loading ? "..." : "Enviar"} 
         </button> 
       </div> 
     </main> 
   ); 
 }
