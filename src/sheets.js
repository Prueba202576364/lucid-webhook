// Agrega filas al Google Sheet de inscripciones, usando una cuenta de servicio
// de Google Cloud — nadie tiene que iniciar sesión, es autenticación
// servidor-a-servidor. Las cuentas de servicio no tienen cuota propia de Drive
// en cuentas personales, así que NO crean el Sheet — el Sheet lo crea una
// persona real y se lo comparte (como Editor) a la cuenta de servicio; acá solo
// se escribe en uno que ya existe (GOOGLE_SHEET_ID).
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY en las variables de entorno.");
  }
  return new google.auth.JWT({ email, key, scopes: SCOPES });
}

// El nombre real de la pestaña dentro del Sheet puede no ser el que
// esperábamos (la persona lo pudo renombrar, o Google le puso "Hoja 1" por
// defecto al importar el CSV) — en vez de asumirlo, se pregunta cuál es la
// primera pestaña real y se usa esa.
async function primeraPestana(sheets, sheetId) {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return data.sheets[0].properties.title;
}

async function agregarFila(titulo, nombreHojaSugerido, encabezados, fila, sheetIdParam) {
  const sheetId = sheetIdParam || process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error(
      "Falta el ID del Sheet — crea el Sheet manualmente, compártelo (Editor) con la cuenta de servicio, y pon su ID en la variable de entorno correspondiente."
    );
  }

  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const nombreHoja = await primeraPestana(sheets, sheetId);

  // No se usa "append" con detección automática de tabla — con encabezados
  // de varias filas o celdas combinadas (como una fila de agrupación arriba
  // de los títulos reales), Google a veces decide que la "tabla" está vacía
  // y termina insertando ARRIBA de los encabezados en vez de debajo de todo.
  // Se calcula la primera fila realmente vacía a mano, revisando todas las
  // columnas (no solo la A, que puede estar en blanco en una fila de
  // encabezado agrupado) y se escribe ahí con un "update" directo.
  const finCol = String.fromCharCode(64 + Math.max(fila.length, encabezados.length, 26));
  const { data: existentes } = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `'${nombreHoja}'!A1:${finCol}2000`,
  });
  const filas = existentes.values || [];
  let ultimaConContenido = 0;
  filas.forEach((f, i) => {
    if (f.some((celda) => celda !== undefined && celda !== null && celda.toString().trim() !== "")) {
      ultimaConContenido = i + 1;
    }
  });
  const numeroFila = ultimaConContenido + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${nombreHoja}'!A${numeroFila}`,
    valueInputOption: "RAW",
    requestBody: { values: [fila] },
  });

  return { sheetId, nombreHoja, fila: numeroFila };
}

// Actualiza una sola celda de una fila ya existente — se usa para completar
// el comprobante de pago cuando llega después, sin tener que reescribir toda
// la fila ni buscarla de nuevo.
async function actualizarCelda(nombreHoja, columnaLetra, fila, valor, sheetIdParam) {
  const sheetId = sheetIdParam || process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error("Falta el ID del Sheet en las variables de entorno.");
  }
  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${nombreHoja}'!${columnaLetra}${fila}`,
    valueInputOption: "RAW",
    requestBody: { values: [[valor]] },
  });
}

// Igual que actualizarCelda, pero para varias columnas consecutivas de una
// misma fila de una sola vez — se usa cuando un bloque posterior (ej. el
// equino, después del jinete) completa varias columnas juntas.
async function actualizarRango(nombreHoja, columnaInicioLetra, columnaFinLetra, fila, valores, sheetIdParam) {
  const sheetId = sheetIdParam || process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error("Falta el ID del Sheet en las variables de entorno.");
  }
  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `'${nombreHoja}'!${columnaInicioLetra}${fila}:${columnaFinLetra}${fila}`,
    valueInputOption: "RAW",
    requestBody: { values: [valores] },
  });
}

module.exports = { agregarFila, actualizarCelda, actualizarRango };
