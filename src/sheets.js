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

async function agregarFila(titulo, nombreHojaSugerido, encabezados, fila) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    throw new Error(
      "Falta GOOGLE_SHEET_ID — crea el Sheet manualmente, compártelo (Editor) con la cuenta de servicio, y pon su ID en esta variable."
    );
  }

  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });

  const nombreHoja = await primeraPestana(sheets, sheetId);

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${nombreHoja}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [fila] },
  });

  return sheetId;
}

module.exports = { agregarFila };
