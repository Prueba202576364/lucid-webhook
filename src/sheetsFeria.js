// Escribe un ejemplar en el Sheet real de la feria — a diferencia de la
// cabalgata, acá NO se agrega una fila al final: la hoja ya viene armada con
// bloques de 11 filas numeradas, uno por cada combinación de Sexo + Modalidad +
// Categoría. Hay que encontrar el bloque correcto y la primera fila vacía
// dentro de ese bloque.
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// Nombre real de cada pestaña — algunas tienen espacios raros al final, hay
// que usarlos tal cual están en el Sheet, no como uno esperaría que se llamen.
const MODALIDAD_A_PESTANA = {
  "Paso Fino P4": "Paso Fino P4",
  "Trocha Colombiana P3": "Trocha Colombia P3",
  "Trocha y Galope P2": "Trocha y Galope P2 ",
  "Trote y Galope P1": "Trote y Galope P1",
  "Sin Paso (Asnales-Mulares)": "Asnales y Mulares",
};

const MODALIDADES_VALIDAS = Object.keys(MODALIDAD_A_PESTANA);

// Cada bloque de sexo ocupa 10 columnas: No, Nombre, Registro, Sexo, Andar,
// Categoría, Criadero/Pesebrera, Propietario/Montador, Nombre palafrenero, Teléfono.
const BLOQUES = [
  { sexo: "HEMBRA", inicio: "A" },
  { sexo: "MACHO", inicio: "N" },
];

function auth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY en las variables de entorno.");
  }
  return new google.auth.JWT({ email, key, scopes: SCOPES });
}

function normalizar(texto) {
  return (texto || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita tildes
}

function letraAColumna(letra) {
  let col = 0;
  for (const c of letra) col = col * 26 + (c.charCodeAt(0) - 64);
  return col;
}
function columnaALetra(col) {
  let letra = "";
  while (col > 0) {
    const resto = (col - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    col = Math.floor((col - 1) / 26);
  }
  return letra;
}

// Lee las categorías reales disponibles para una Modalidad + Sexo dados —
// se usa para que Claude elija entre las que de verdad existen en el Sheet,
// no una lista que nosotros adivinemos.
async function obtenerCategoriasReales(modalidad, sexo) {
  const pestana = MODALIDAD_A_PESTANA[modalidad];
  if (!pestana) throw new Error(`Modalidad no reconocida: ${modalidad}`);
  const sheetId = process.env.FERIA_SHEET_ID;
  if (!sheetId) throw new Error("Falta FERIA_SHEET_ID en las variables de entorno.");

  const bloque = BLOQUES.find((b) => b.sexo === normalizar(sexo).toUpperCase() || b.sexo === sexo.toUpperCase());
  const inicioCol = letraAColumna(bloque.inicio);
  const finCol = columnaALetra(inicioCol + 9);
  const rango = `'${pestana}'!${bloque.inicio}1:${finCol}2000`;

  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: rango });
  const filas = data.values || [];

  const categorias = [];
  for (const fila of filas) {
    // La fila "1" de cada bloque de 11 trae el header en la posición 5 (Categoría / Edad)
    if (fila[0] === "1" && fila[5]) categorias.push(fila[5].trim());
  }
  return [...new Set(categorias)];
}

// Busca el bloque exacto (por Sexo + Modalidad + Categoría) y dentro de él la
// primera fila vacía. Devuelve null si el bloque está lleno (las 11 filas ya
// tienen ejemplar) o si no encuentra el bloque.
async function escribirEjemplar({ modalidad, sexo, categoria, nombreEjemplar, registro, criaderoDondePasta, nombreMontador, nombrePalafrenero, telefonoPalafrenero }) {
  const pestana = MODALIDAD_A_PESTANA[modalidad];
  if (!pestana) throw new Error(`Modalidad no reconocida: ${modalidad}`);
  const sheetId = process.env.FERIA_SHEET_ID;
  if (!sheetId) throw new Error("Falta FERIA_SHEET_ID en las variables de entorno.");

  const bloque = BLOQUES.find((b) => b.sexo === sexo.toUpperCase());
  if (!bloque) throw new Error(`Sexo no reconocido: ${sexo}`);
  const inicioCol = letraAColumna(bloque.inicio);
  const finCol = columnaALetra(inicioCol + 9);
  const rango = `'${pestana}'!${bloque.inicio}1:${finCol}2000`;

  const authClient = auth();
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: rango });
  const filas = data.values || [];

  // Busca la fila donde empieza el bloque correcto (No.=1, Sexo y Categoría coinciden)
  let filaInicioBloque = -1;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (f[0] === "1" && normalizar(f[3]) === normalizar(sexo) && normalizar(f[5]) === normalizar(categoria)) {
      filaInicioBloque = i;
      break;
    }
  }
  if (filaInicioBloque === -1) {
    return { escrito: false, motivo: "bloque_no_encontrado" };
  }

  // Dentro de las siguientes 11 filas (No. 1 a 11), busca la primera con "Nombre del Ejemplar" vacío
  let filaLibre = -1;
  for (let i = filaInicioBloque; i < filaInicioBloque + 11 && i < filas.length; i++) {
    if (!filas[i][1] || !filas[i][1].toString().trim()) {
      filaLibre = i;
      break;
    }
  }
  if (filaLibre === -1) {
    return { escrito: false, motivo: "cupo_lleno" };
  }

  const filaReal = filaLibre + 1; // 1-indexado para la API
  const colNombre = columnaALetra(inicioCol + 1);
  const colRegistro = columnaALetra(inicioCol + 2);
  const colCriadero = columnaALetra(inicioCol + 6);
  const colMontador = columnaALetra(inicioCol + 7);
  const colPalafrenero = columnaALetra(inicioCol + 8);
  const colTelefonoPalafrenero = columnaALetra(inicioCol + 9);

  // Rangos separados a propósito — nunca tocan D:F (Sexo/Andar/Categoría).
  // Esas tres columnas solo vienen escritas en la PRIMERA fila de cada bloque
  // (el encabezado del bloque); si el cupo libre resulta ser esa primera
  // fila, no queremos borrar esas etiquetas escribiendo vacío encima.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `'${pestana}'!${colNombre}${filaReal}:${colRegistro}${filaReal}`, values: [[nombreEjemplar, registro]] },
        { range: `'${pestana}'!${colCriadero}${filaReal}:${colTelefonoPalafrenero}${filaReal}`, values: [[criaderoDondePasta, nombreMontador, nombrePalafrenero, telefonoPalafrenero]] },
      ],
    },
  });

  return { escrito: true, pestana, fila: filaReal, numeroEnBloque: filaLibre - filaInicioBloque + 1 };
}

module.exports = { obtenerCategoriasReales, escribirEjemplar, MODALIDADES_VALIDAS };
