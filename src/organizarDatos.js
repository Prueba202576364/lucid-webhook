// Extracción de los datos de cabalgata — separada en dos funciones (jinete /
// equino) porque ahora cada bloque se guarda apenas se completa, no se
// espera a tener los dos para recién ahí guardar algo.
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function contextoConfirmado(yaConfirmado) {
  return yaConfirmado && Object.values(yaConfirmado).some((v) => v)
    ? `\nOJO: esta persona ya había dado antes estos datos, que quedaron CONFIRMADOS y no debes cambiar ni reinventar — solo repítelos tal cual si el texto nuevo no dice lo contrario:\n${JSON.stringify(yaConfirmado)}\n` +
      `El texto nuevo probablemente solo trae el dato (o los datos) que todavía faltaban — asígnalo al campo vacío que mejor le corresponda, no lo pongas en un campo que ya estaba confirmado.\n`
    : "";
}

const ESQUEMA_JINETE = {
  type: "object",
  properties: {
    nombreCompleto: { type: "string", description: "Nombre completo del jinete" },
    cedula: { type: "string", description: "Número de cédula" },
    telefono: { type: "string", description: "Número de teléfono" },
    contacto: { type: "string", description: "Número de contacto (puede repetir el teléfono si es el mismo)" },
    municipio: { type: "string", description: "Municipio de residencia" },
  },
  required: ["nombreCompleto", "cedula", "telefono", "contacto", "municipio"],
  additionalProperties: false,
};

async function organizarJinete(datosJineteTexto, yaConfirmado) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_JINETE } },
    messages: [
      {
        role: "user",
        content:
          `Un jinete escribió esto sobre sí mismo (nombre completo, cédula, teléfono, contacto y municipio, ` +
          `en el orden y formato que haya usado):\n"""${datosJineteTexto}"""\n\n` +
          contextoConfirmado(yaConfirmado) +
          `Extrae cada dato al campo correspondiente. Si un dato no aparece en el texto, deja ese campo ` +
          `como cadena vacía — no inventes ni completes nada que no esté escrito.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del jinete (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del jinete.");
  return JSON.parse(bloque.text);
}

const ESQUEMA_EQUINO = {
  type: "object",
  properties: {
    nombreEjemplar: { type: "string", description: "Nombre del caballo/ejemplar" },
    edadEquino: { type: "string", description: "Edad del equino" },
    tieneMicrochip: { type: "string", description: 'Responder exactamente "Si" o "No"' },
    numeroMicrochip: { type: "string", description: "Número del microchip, si tiene" },
  },
  required: ["nombreEjemplar", "edadEquino", "tieneMicrochip", "numeroMicrochip"],
  additionalProperties: false,
};

async function organizarEquino(datosEquinoTexto, yaConfirmado) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_EQUINO } },
    messages: [
      {
        role: "user",
        content:
          `Datos de un equino para la cabalgata (nombre del ejemplar, edad, si tiene microchip y su número), en texto libre:\n"""${datosEquinoTexto}"""\n\n` +
          contextoConfirmado(yaConfirmado) +
          `Extrae cada dato al campo correspondiente. Si un dato no aparece en el texto, deja ese campo ` +
          `como cadena vacía — no inventes ni completes nada que no esté escrito.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del equino (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del equino.");
  return JSON.parse(bloque.text);
}

module.exports = { organizarJinete, organizarEquino };
