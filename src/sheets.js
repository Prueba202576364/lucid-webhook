// Crea (una sola vez) y mantiene el Google Sheet de inscripciones, usando una
// cuenta de servicio de Google Cloud — nadie tiene que iniciar sesión, es
// autenticación servidor-a-servidor. La cuenta de servicio es la "dueña" del
// Sheet que crea, así que se comparte automáticamente con GOOGLE_SHEET_SHARE_WITH
// para que aparezca en el Drive de una persona real.
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"];

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY en las variables de entorno.");
  }
  return new google.auth.JWT({ email, key, scopes: SCOPES });
}

// Si GOOGLE_SHEET_ID ya está configurado, se reutiliza siempre ese Sheet.
// Si no, se crea uno nuevo la primera vez que se necesita — después de eso hay
// que copiar el ID que se imprime en el log y guardarlo en GOOGLE_SHEET_ID,
// para no crear un Sheet distinto en cada arranque del servidor.
async function obtenerOCrearSheetId(titulo, nombreHoja, encabezados) {
  if (process.env.GOOGLE_SHEET_ID) return process.env.GOOGLE_SHEET_ID;

  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const drive = google.drive({ version: "v3", auth: authClient });

  const { data } = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: titulo },
      sheets: [{ properties: { title: nombreHoja } }],
    },
  });
  const sheetId = data.spreadsheetId;

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${nombreHoja}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [encabezados] },
  });

  const compartirCon = process.env.GOOGLE_SHEET_SHARE_WITH;
  if (compartirCon) {
    await drive.permissions.create({
      fileId: sheetId,
      sendNotificationEmail: true,
      requestBody: { type: "user", role: "writer", emailAddress: compartirCon },
    });
  }

  console.log(`Google Sheet creado: https://docs.google.com/spreadsheets/d/${sheetId} — guarda este ID en GOOGLE_SHEET_ID.`);
  return sheetId;
}

async function agregarFila(titulo, nombreHoja, encabezados, fila) {
  const sheetId = await obtenerOCrearSheetId(titulo, nombreHoja, encabezados);
  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });

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
