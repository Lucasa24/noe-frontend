"use client"; 
 
 import { useState } from "react"; 
 
 export default function Home() { 
   const [input, setInput] = useState(""); 
   const [out, setOut] = useState(""); 
   const [loading, setLoading] = useState(false); 
 
   async function send() { 
     setLoading(true); 
     setOut(""); 
 
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
 
       buf += decoder.decode(value, { stream: true }); 
 
       // Eventos SSE são separados por "\n\n" 
       const parts = buf.split("\n\n"); 
       buf = parts.pop() || ""; 
 
       for (const part of parts) { 
         const line = part 
           .split("\n") 
           .find((l) => l.startsWith("data: ")); 
 
         if (!line) continue; 
 
         const payload = line.slice(6); 
         const token = JSON.parse(payload); 
         if (typeof token === "string") {
           setOut((prev) => prev + token);
         } 
       } 
     } 
 
     setLoading(false); 
   } 
 
   return ( 
     <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800 }}> 
       <h1>Nóe (teste streaming)</h1> 
 
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
