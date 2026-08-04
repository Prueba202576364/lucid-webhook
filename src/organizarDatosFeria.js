// Extracción de datos de la Feria — separada por bloque (ejemplar / montador
// / palafrenero / propietario), porque cada bloque se guarda apenas se
// completa, no se espera a tenerlos todos para recién ahí guardar algo.
const Anthropic = require("@anthropic-ai/sdk");
const { MODALIDADES_VALIDAS, obtenerCategoriasReales } = require("./sheetsFeria");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cuando ya hay datos confirmados de un intento anterior (un reintento corto
// que solo trae el dato que faltaba), se le dice a Claude cuáles ya quedaron
// resueltos y cuáles siguen pendientes — si no, un texto corto puede
// asignarse al campo equivocado y pisar por error un dato que ya estaba bien.
function contextoConfirmado(yaConfirmado) {
  return yaConfirmado && Object.values(yaConfirmado).some((v) => v)
    ? `\nOJO: esta persona ya había dado antes estos datos, que quedaron CONFIRMADOS y no debes cambiar ni reinventar — solo repítelos tal cual si el texto nuevo no dice lo contrario:\n${JSON.stringify(yaConfirmado)}\n` +
      `El texto nuevo probablemente solo trae el dato (o los datos) que todavía faltaban — asígnalo al campo vacío que mejor le corresponda, no lo pongas en un campo que ya estaba confirmado.\n`
    : "";
}

const ESQUEMA_EJEMPLAR = {
  type: "object",
  properties: {
    nombreEjemplar: { type: "string" },
    registro: { type: "string", description: "Número de registro del ejemplar" },
    criaderoDondePasta: { type: "string" },
    sexo: { type: "string", enum: ["HEMBRA", "MACHO"], description: "Sexo del ejemplar, según lo que la persona haya escrito" },
    modalidad: { type: "string", enum: MODALIDADES_VALIDAS, description: "El \"Andar\" del ejemplar, elegido de la lista real del reglamento" },
    categoriaTexto: { type: "string", description: "Lo que la persona escribió sobre la edad/categoría, tal cual (ej. \"3 años\", \"potro joven\") — no lo conviertas todavía" },
  },
  required: ["nombreEjemplar", "registro", "criaderoDondePasta", "sexo", "modalidad", "categoriaTexto"],
  additionalProperties: false,
};

async function extraerEjemplar(datosEjemplarTexto, yaConfirmado) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_EJEMPLAR } },
    messages: [
      {
        role: "user",
        content:
          `Datos de un ejemplar (caballo) para una exposición equina, escritos en texto libre:\n"""${datosEjemplarTexto}"""\n\n` +
          contextoConfirmado(yaConfirmado) +
          `Extrae cada dato. Para "sexo", identifica si el ejemplar es Hembra o Macho según lo que escribió la persona. ` +
          `Para "modalidad", elige la opción de la lista que mejor corresponda a lo que la persona describió ` +
          `(por ejemplo si menciona "paso fino" corresponde a "Paso Fino P4"; si menciona burros o mulas corresponde a ` +
          `"Sin Paso (Asnales-Mulares)"). Para "categoriaTexto" copia tal cual lo que la persona escribió sobre edad o categoría, ` +
          `sin intentar convertirlo todavía. Si algún dato no aparece, deja el campo como cadena vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del ejemplar (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del ejemplar.");
  return JSON.parse(bloque.text);
}

async function elegirCategoriaReal(categoriaTexto, categoriasReales) {
  if (categoriasReales.length === 0) {
    throw new Error("No se encontraron categorías reales en el Sheet para esta modalidad/sexo.");
  }
  const esquema = {
    type: "object",
    properties: {
      categoria: { type: "string", enum: categoriasReales },
    },
    required: ["categoria"],
    additionalProperties: false,
  };
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: esquema } },
    messages: [
      {
        role: "user",
        content:
          `Un cliente describió la edad/categoría de su ejemplar así: "${categoriaTexto}"\n\n` +
          `Elige, de las categorías reales disponibles, la que mejor corresponda. Si describió una edad en meses o años, ` +
          `conviértela y ubícala en el rango correcto. Si no hay forma razonable de saber cuál es, elige la que te parezca más cercana.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo elegir la categoría (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió la categoría elegida.");
  return JSON.parse(bloque.text).categoria;
}

const ESQUEMA_MONTADOR = {
  type: "object",
  properties: {
    nombreMontador: { type: "string" },
    documentoMontador: { type: "string" },
    telefonoMontador: { type: "string" },
  },
  required: ["nombreMontador", "documentoMontador", "telefonoMontador"],
  additionalProperties: false,
};

async function extraerMontador(datosMontadorTexto, yaConfirmado) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_MONTADOR } },
    messages: [
      {
        role: "user",
        content:
          `Datos del montador de un ejemplar para una exposición equina, en texto libre:\n"""${datosMontadorTexto}"""\n\n` +
          contextoConfirmado(yaConfirmado) +
          `Extrae nombre, documento y teléfono. Si algún dato no aparece, deja el campo como cadena vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del montador (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del montador.");
  return JSON.parse(bloque.text);
}

const ESQUEMA_PALAFRENERO = {
  type: "object",
  properties: {
    nombrePalafrenero: { type: "string" },
    telefonoPalafrenero: { type: "string" },
  },
  required: ["nombrePalafrenero", "telefonoPalafrenero"],
  additionalProperties: false,
};

async function extraerPalafrenero(datosPalafreneroTexto, yaConfirmado) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_PALAFRENERO } },
    messages: [
      {
        role: "user",
        content:
          `Datos del palafrenero de un ejemplar para una exposición equina, en texto libre:\n"""${datosPalafreneroTexto}"""\n\n` +
          contextoConfirmado(yaConfirmado) +
          `Extrae nombre y teléfono. Si algún dato no aparece, deja el campo como cadena vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del palafrenero (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del palafrenero.");
  return JSON.parse(bloque.text);
}

const ESQUEMA_PROPIETARIO = {
  type: "object",
  properties: {
    nombrePropietario: { type: "string", description: "Nombre completo o razón social" },
    documentoPropietario: { type: "string", description: "Tipo y número de documento" },
    telefonoPropietario: { type: "string" },
    correoPropietario: { type: "string" },
    municipioPropietario: { type: "string" },
  },
  required: ["nombrePropietario", "documentoPropietario", "telefonoPropietario", "correoPropietario", "municipioPropietario"],
  additionalProperties: false,
};

async function organizarPropietario(datosPropietarioTexto, yaConfirmado) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_PROPIETARIO } },
    messages: [
      {
        role: "user",
        content:
          `Datos de el propietario/criadero de un ejemplar para una exposición equina, en texto libre:\n"""${datosPropietarioTexto}"""\n\n` +
          contextoConfirmado(yaConfirmado) +
          `Extrae cada dato: nombre completo o razón social, tipo y número de documento, teléfono, correo electrónico y municipio. ` +
          `Si algún dato no aparece, deja el campo como cadena vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del propietario (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del propietario.");
  return JSON.parse(bloque.text);
}

module.exports = {
  extraerEjemplar,
  extraerMontador,
  extraerPalafrenero,
  obtenerCategoriasReales,
  elegirCategoriaReal,
  organizarPropietario,
};
