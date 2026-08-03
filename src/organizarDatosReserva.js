// Extracción de datos para la reserva de un palco (cliente final, vía el bot
// de WhatsApp) — dos partes: los datos del responsable (texto libre, igual
// que jinete/propietario) y los días+cantidad de sillas si aplica (el tipo
// de palco ya llega bastante limpio porque Lucid lo pregunta como opción
// cerrada, así que eso se resuelve con una simple normalización de texto,
// sin gastar una llamada a Claude en algo que no lo necesita).
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ESQUEMA_CLIENTE = {
  type: "object",
  properties: {
    nombreCompleto: { type: "string" },
    cedula: { type: "string" },
    telefono: { type: "string" },
    correo: { type: "string" },
  },
  required: ["nombreCompleto", "cedula", "telefono", "correo"],
  additionalProperties: false,
};

async function extraerCliente(datosClienteTexto, yaConfirmado) {
  const contexto = yaConfirmado && Object.values(yaConfirmado).some((v) => v)
    ? `\nOJO: esta persona ya había dado antes estos datos, que quedaron CONFIRMADOS y no debes cambiar ni reinventar — solo repítelos tal cual si el texto nuevo no dice lo contrario:\n${JSON.stringify(yaConfirmado)}\n` +
      `El texto nuevo probablemente solo trae el dato (o los datos) que todavía faltaban — asígnalo al campo vacío que mejor le corresponda, no lo pongas en un campo que ya estaba confirmado.\n`
    : "";

  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_CLIENTE } },
    messages: [
      {
        role: "user",
        content:
          `Datos del responsable de una reserva de palco para una feria, en texto libre:\n"""${datosClienteTexto}"""\n\n` +
          contexto +
          `Extrae nombre completo, cédula, teléfono y correo electrónico. Si algún dato no aparece, deja el campo como cadena vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del cliente (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del cliente.");
  return JSON.parse(bloque.text);
}

function normalizar(texto) {
  return (texto || "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// El tipo de palco ya viene de una pregunta de opción cerrada en Lucid — solo
// hay que reconocer cuál de las dos eligió, sin necesidad de Claude.
function extraerTipoPalco(tipoPalcoTexto) {
  const t = normalizar(tipoPalcoTexto);
  if (t.includes("complet")) return "COMPLETO";
  if (t.includes("dia") || t.includes("silla")) return "SILLAS";
  return "";
}

const DIAS_VALIDOS = ["viernes", "sabado", "domingo"];

const ESQUEMA_DIAS = {
  type: "object",
  properties: {
    dias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dia: { type: "string", enum: DIAS_VALIDOS },
          cantidad: { type: "integer" },
        },
        required: ["dia", "cantidad"],
        additionalProperties: false,
      },
    },
  },
  required: ["dias"],
  additionalProperties: false,
};

async function extraerDiasSillas(datosDiasTexto) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_DIAS } },
    messages: [
      {
        role: "user",
        content:
          `Una persona describió cuántas sillas quiere reservar y para qué día(s), en texto libre:\n"""${datosDiasTexto}"""\n\n` +
          `Extrae una lista de { dia, cantidad } — un elemento por cada día que mencione, con la cantidad de sillas para ese día. ` +
          `Si no menciona ningún día claro o no hay cantidades, devuelve una lista vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar los días de la reserva (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los días de la reserva.");
  return JSON.parse(bloque.text).dias;
}

// Extrae el primer número que aparezca en el texto (ej. "el palco 12 porfa"
// -> 12) — no hace falta Claude para esto, es solo un dígito suelto.
function extraerNumeroPalco(texto) {
  const m = (texto || "").toString().match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

module.exports = { extraerCliente, extraerTipoPalco, extraerDiasSillas, extraerNumeroPalco, DIAS_VALIDOS };
