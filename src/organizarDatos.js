// Lucid ahora pide los datos del jinete y del equino en dos mensajes de texto
// libre (una sola pregunta por grupo, en vez de una pregunta por dato) — este
// módulo usa Claude para leer ese texto, sin importar el orden ni el formato
// en el que la persona haya escrito, y devolver los campos ya separados.
const Anthropic = require("@anthropic-ai/sdk");

const ESQUEMA = {
  type: "object",
  properties: {
    nombreCompleto: { type: "string", description: "Nombre completo del jinete" },
    cedula: { type: "string", description: "Número de cédula" },
    telefono: { type: "string", description: "Número de teléfono" },
    contacto: { type: "string", description: "Número de contacto (puede repetir el teléfono si es el mismo)" },
    municipio: { type: "string", description: "Municipio de residencia" },
    nombreEjemplar: { type: "string", description: "Nombre del caballo/ejemplar" },
    edadEquino: { type: "string", description: "Edad del equino" },
    tieneMicrochip: { type: "string", description: 'Responder exactamente "Si" o "No"' },
    numeroMicrochip: { type: "string", description: "Número del microchip, si tiene" },
  },
  required: [
    "nombreCompleto",
    "cedula",
    "telefono",
    "contacto",
    "municipio",
    "nombreEjemplar",
    "edadEquino",
    "tieneMicrochip",
    "numeroMicrochip",
  ],
  additionalProperties: false,
};

async function organizarDatosJineteEquino(datosJineteTexto, datosEquinoTexto, yaConfirmado) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Cuando ya hay datos confirmados de un intento anterior (un reintento
  // corto que solo trae el dato que faltaba), se le dice a Claude cuáles ya
  // quedaron resueltos y cuáles siguen pendientes — si no, un texto corto
  // puede asignarse al campo equivocado y pisar por error un dato que ya
  // estaba bien.
  const contexto = yaConfirmado && Object.values(yaConfirmado).some((v) => v)
    ? `\nOJO: esta persona ya había dado antes estos datos, que quedaron CONFIRMADOS y no debes cambiar ni reinventar — solo repítelos tal cual si el texto nuevo no dice lo contrario:\n${JSON.stringify(yaConfirmado)}\n` +
      `El texto nuevo probablemente solo trae el dato (o los datos) que todavía faltaban — asígnalo al campo vacío que mejor le corresponda, no lo pongas en un campo que ya estaba confirmado.\n`
    : "";

  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: ESQUEMA },
    },
    messages: [
      {
        role: "user",
        content:
          `Un jinete escribió esto sobre sí mismo (nombre completo, cédula, teléfono, contacto y municipio, ` +
          `en el orden y formato que haya usado):\n"""${datosJineteTexto}"""\n\n` +
          `Y esto sobre su caballo (nombre del ejemplar, edad, si tiene microchip y su número):\n` +
          `"""${datosEquinoTexto}"""\n\n` +
          contexto +
          `Extrae cada dato al campo correspondiente. Si un dato no aparece en el texto, deja ese campo ` +
          `como cadena vacía — no inventes ni completes nada que no esté escrito.`,
      },
    ],
  });

  if (mensaje.stop_reason === "refusal") {
    throw new Error("Claude no pudo procesar el texto (refusal).");
  }

  const bloqueTexto = mensaje.content.find((b) => b.type === "text");
  if (!bloqueTexto) throw new Error("Claude no devolvió los datos organizados.");

  return JSON.parse(bloqueTexto.text);
}

module.exports = { organizarDatosJineteEquino };
