export const runtime = "nodejs"; 
 
 function sleep(ms: number) { 
   return new Promise((r) => setTimeout(r, ms)); 
 } 
 
 export async function POST(req: Request) { 
   const { message } = await req.json(); 
 
   const encoder = new TextEncoder(); 
 
   const stream = new ReadableStream({ 
     async start(controller) { 
       // MVP: simulação de streaming (pra validar end-to-end) 
       const text = 
         `Nóe: entendi. Você disse: "${message}". ` + 
         `Agora me responde rápido: qual seu nicho e qual transformação você vende?`; 
 
       for (const ch of text) { 
         controller.enqueue(encoder.encode(`data: ${JSON.stringify(ch)}\n\n`)); 
         await sleep(12); 
       } 
 
       controller.enqueue(encoder.encode(`event: done\n\n`)); 
       controller.close(); 
     }, 
   }); 
 
   return new Response(stream, { 
     headers: { 
       "Content-Type": "text/event-stream; charset=utf-8", 
       "Cache-Control": "no-cache, no-transform", 
       Connection: "keep-alive", 
     }, 
   }); 
 }
