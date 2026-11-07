export default async (request) => {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  const respond = (statusCode, body) => new Response(JSON.stringify(body), { status: statusCode, headers });

  if (request.method !== "POST") return respond(405, { error: "Método no permitido." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return respond(500, { error: "Falta configurar GEMINI_API_KEY en las variables de entorno de Netlify." });

  let payload;
  try { payload = await request.json(); }
  catch { return respond(400, { error: "La solicitud no contiene JSON válido." }); }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return respond(400, { error: "Escribe una pregunta para el asistente." });
  if (message.length > 4000) return respond(413, { error: "La pregunta es demasiado larga." });

  const history = Array.isArray(payload.history) ? payload.history.slice(-12) : [];
  const contents = history
    .filter(item => item && typeof item.content === "string" && ["user", "assistant"].includes(item.role))
    .map(item => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content.slice(0, 4000) }] }));

  // El último mensaje ya está incluido en history desde el navegador.
  if (!contents.length || contents[contents.length - 1].role !== "user") {
    contents.push({ role: "user", parts: [{ text: message }] });
  }

  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Eres BioVolt Assistant, el asistente de una plataforma académica de BioVolt, un proyecto de energía sostenible que aprovecha residuos orgánicos y agrícolas. Responde siempre en español claro, amable y conciso. Ayuda con biomasa, producción energética, plantas, inventario, proveedores, clientes, sostenibilidad y el funcionamiento del prototipo. No inventes cifras ni afirmes que puedes consultar una base de datos en tiempo real: los datos visibles en la web son demostrativos y no hay conexión activa a MySQL. Si no conoces un dato específico, dilo con honestidad y explica qué información haría falta." }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
      })
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = result?.error?.message || `Gemini respondió HTTP ${upstream.status}.`;
      const status = upstream.status === 429 ? 429 : 502;
      return respond(status, { error: detail });
    }
    const reply = result?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    if (!reply) return respond(502, { error: "Gemini no devolvió texto. Intenta de nuevo." });
    return respond(200, { reply });
  } catch (error) {
    return respond(502, { error: "No se pudo conectar con Gemini. " + (error?.message || "") });
  }
};
