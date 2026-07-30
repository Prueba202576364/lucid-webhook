// Organiza el texto libre de un ejemplar + montador (feria) usando Claude, en
// dos pasos:
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
  },
  required: ["nombreEjemplar", "registro", "criaderoDondePasta", "sexo", "modalidad", "categoriaTexto", "nombreMontador", "documentoMontador", "telefonoMontador"],
  additionalProperties: false,
};

async function extraerEjemplarMontador(datosEjemplarTexto, datosMontadorTexto) {
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

async function organizarEjemplarMontador(datosEjemplarTexto, datosMontadorTexto) {
  const extraido = await extraerEjemplarMontador(datosEjemplarTexto, datosMontadorTexto);
  const categoriasReales = await obtenerCategoriasReales(extraido.modalidad, extraido.sexo);
  const categoria = await elegirCategoriaReal(extraido.categoriaTexto, categoriasReales);
  return { ...extraido, categoria };
}

// El palafrenero se recolecta en su propio loop, aparte, así que hay que
// adivinar a cuál ejemplar se refiere el texto — restringido a los nombres
// reales de ejemplares que ya se registraron en ese mismo lote, nunca a uno
// inventado.
async function organizarPalafrenero(datosPalafreneroTexto, nombresEjemplaresReales) {
  if (nombresEjemplaresReales.length === 0) {
    throw new Error("No hay ejemplares registrados en este lote para asociar el palafrenero.");
  }
  const esquema = {
    type: "object",
    properties: {
      nombrePalafrenero: { type: "string" },
      telefonoPalafrenero: { type: "string" },
      nombreEjemplar: { type: "string", enum: nombresEjemplaresReales, description: "A cuál de los ejemplares ya registrados cuida este palafrenero" },
    },
    required: ["nombrePalafrenero", "telefonoPalafrenero", "nombreEjemplar"],
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
          `Datos de un palafrenero para una exposición equina, en texto libre:\n"""${datosPalafreneroTexto}"""\n\n` +
          `Extrae su nombre y teléfono. Para "nombreEjemplar", elige de la lista de ejemplares ya registrados el que mejor ` +
          `corresponda a lo que la persona mencionó (puede venir con errores de tipeo o mayúsculas distintas). Si no menciona ` +
          `ningún ejemplar y solo hay uno en la lista, asume que es ese.`,
      },
    ],
  });
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no pudo procesar el texto del palafrenero (refusal).");
  const bloque = mensaje.content.find((b) => b.type === "text");
  if (!bloque) throw new Error("Claude no devolvió los datos del palafrenero.");
  return JSON.parse(bloque.text);
}

module.exports = { organizarEjemplarMontador, organizarPalafrenero };
