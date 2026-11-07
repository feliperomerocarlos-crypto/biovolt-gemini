const MODEL = 'gemini-3.8-flash';

const SYSTEM_INSTRUCTION = `Eres BioVolt Assistant, el asistente virtual de BioVolt, un proyecto académico colombiano de gestión sostenible que aprovecha residuos orgánicos y agrícolas para producir energía y apoyar operaciones. Responde siempre en español claro, amable y directo. Ayuda con biomasa, plantas, inventario, producción, clientes, proveedores, impacto ambiental y soporte. IMPORTANTE: no tienes conexión a la base de datos MySQL ni acceso en tiempo real a los registros internos. No inventes cifras, estados, nombres ni resultados operativos. Si preguntan por datos reales o actuales, explica que esta versión solo conoce el contexto general del proyecto y que los indicadores de la página son datos de demostración. Distingue claramente ejemplos de datos verificados. No afirmes haber ejecutado acciones ni modificado registros.`;

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Falta configurar GEMINI_API_KEY en las variables de entorno de Netlify.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 2000) {
      return new Response(JSON.stringify({ error: 'Escribe una pregunta de hasta 2000 caracteres.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }

    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const contents = history
      .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
      .map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content.slice(0, 2000) }] }));

    // Evita duplicar el mensaje actual si ya viene incluido en el historial del navegador.
    const last = contents[contents.length - 1];
    if (!last || last.role !== 'user' || last.parts[0].text !== message) {
      contents.push({ role: 'user', parts: [{ text: message }] });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: { temperature: 0.5, maxOutputTokens: 700 }
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = result?.error?.message || 'Error al consultar Gemini.';
      return new Response(JSON.stringify({ error: detail }), {
        status: response.status, headers: { 'Content-Type': 'application/json' }
      });
    }

    const reply = result?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
    if (!reply) throw new Error('Gemini no devolvió texto. Inténtalo de nuevo.');

    return new Response(JSON.stringify({ reply }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Error interno del asistente.' }), {
      status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};
