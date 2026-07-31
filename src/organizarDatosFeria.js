// Organiza el texto libre de un ejemplar + montador + palafrenero (feria)
// usando Claude, en dos pasos:
//   1) extraer los datos + adivinar la Modalidad (siempre son las mismas 5
//      opciones fijas del reglamento, así que se puede restringir de una).
//   2) con la Modalidad ya resuelta, elegir la Categoría real — esta sí
//      depende del Sexo y de la Modalidad, así que se lee la lista real desde
//      el Sheet en el momento y se le pide a Claude que elija SOLO entre esas,
//      nunca que invente una.
const Anthropic = require("@anthropic-ai/sdk");
const { MODALIDADES_VALIDAS, obtenerCategoriasReales } = require("./sheetsFeria");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ESQUEMA_EXTRACCION = {
  type: "object",
  properties: {
    nombreEjemplar: { type: "string" },
    registro: { type: "string", description: "Número de registro del ejemplar" },
    criaderoDondePasta: { type: "string" },
    sexo: { type: "string", enum: ["HEMBRA", "MACHO"], description: "Sexo del ejemplar, según lo que la persona haya escrito" },
    modalidad: { type: "string", enum: MODALIDADES_VALIDAS, description: "El \"Andar\" del ejemplar, elegido de la lista real del reglamento" },
    categoriaTexto: { type: "string", description: "Lo que la persona escribió sobre la edad/categoría, tal cual (ej. \"3 años\", \"potro joven\") — no lo conviertas todavía" },
    nombreMontador: { type: "string" },
    documentoMontador: { type: "string" },
    telefonoMontador: { type: "string" },
    nombrePalafrenero: { type: "string" },
    telefonoPalafrenero: { type: "string" },
  },
  required: [
    "nombreEjemplar", "registro", "criaderoDondePasta", "sexo", "modalidad", "categoriaTexto",
    "nombreMontador", "documentoMontador", "telefonoMontador", "nombrePalafrenero", "telefonoPalafrenero",
  ],
  additionalProperties: false,
};

async function extraerEjemplarMontador(datosEjemplarTexto, datosMontadorTexto, datosPalafreneroTexto) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_EXTRACCION } },
    messages: [
      {
        role: "user",
        content:
          `Datos de un ejemplar (caballo) para una exposición equina, escritos en texto libre:\n"""${datosEjemplarTexto}"""\n\n` +
          `Datos del montador de ese ejemplar:\n"""${datosMontadorTexto}"""\n\n` +
          `Datos del palafrenero de ese ejemplar:\n"""${datosPalafreneroTexto}"""\n\n` +
          `Extrae cada dato. Para "sexo", identifica si el ejemplar es Hembra o Macho según lo que escribió la persona. ` +
          `Para "modalidad", elige la opción de la lista que mejor corresponda a lo que la persona describió ` +
          `(por ejemplo si menciona "paso fino" corresponde a "Paso Fino P4"; si menciona burros o mulas corresponde a ` +
          `"Sin Paso (Asnales-Mulares)"). Para "categoriaTexto" copia tal cual lo que la persona escribió sobre edad o categoría, ` +
          `sin intentar convertirlo todavía. Si algún dato no aparece, deja el campo como cadena vacía — no inventes nada.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto (refusal).");
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

async function organizarEjemplarCompleto(datosEjemplarTexto, datosMontadorTexto, datosPalafreneroTexto) {
  const extraido = await extraerEjemplarMontador(datosEjemplarTexto, datosMontadorTexto, datosPalafreneroTexto);
  const categoriasReales = await obtenerCategoriasReales(extraido.modalidad, extraido.sexo);
  const categoria = await elegirCategoriaReal(extraido.categoriaTexto, categoriasReales);
  return { ...extraido, categoria };
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

async function organizarPropietario(datosPropietarioTexto) {
  const mensaje = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_PROPIETARIO } },
    messages: [
      {
        role: "user",
        content:
          `Datos de el propietario/criadero de un ejemplar para una exposición equina, en texto libre:\n"""${datosPropietarioTexto}"""\n\n` +
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

module.exports = { organizarEjemplarCompleto, organizarPropietario };
