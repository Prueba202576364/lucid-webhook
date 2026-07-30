// Inscripción de un binomio (jinete + equino) para la cabalgata, recolectada por
// el flujo de WhatsApp en Lucid. El jinete y el equino ahora se recolectan en
// dos mensajes de texto libre (una pregunta por grupo, no una por dato) — Claude
// organiza ese texto en los campos separados antes de guardar. Guarda en
// Firestore (fuente de verdad) y en el mismo momento agrega una fila al Google
// Sheet (para que el organizador la vea sin entrar a Firebase).
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { agregarFila } = require("./sheets");
const { organizarDatosJineteEquino } = require("./organizarDatos");

const TITULO_SHEET = "Inscripciones Cabalgata - Expo Equinox 2026";
const NOMBRE_HOJA = "Inscripciones";

const ENCABEZADOS = [
  "Fecha inscripcion",
  "nombre",
  "cedula",
  "telefono",
  "contacto",
  "municipio",
  "es mayor de edad",
  "acepta articulo sexto",
  "acepta articulo septimo",
  "nombre ejemplar",
  "edad equino",
  "tiene microchip",
  "numero microchip",
  "soporte pago",
];

async function registrarInscripcionCabalgata(datos = {}) {
  const {
    datosJineteTexto = "",
    datosEquinoTexto = "",
    esMayorDeEdad = "",
    aceptaArticuloSexto = "",
    aceptaArticuloSeptimo = "",
    soportePago = "",
  } = datos;

  if (!datosJineteTexto || !datosEquinoTexto) {
    const error = new Error("Faltan campos obligatorios: datosJineteTexto y datosEquinoTexto.");
    error.status = 400;
    throw error;
  }

  const {
    nombreCompleto,
    cedula,
    telefono,
    contacto,
    municipio,
    nombreEjemplar,
    edadEquino,
    tieneMicrochip,
    numeroMicrochip,
  } = await organizarDatosJineteEquino(datosJineteTexto, datosEquinoTexto);

  if (!nombreCompleto || !nombreEjemplar) {
    const error = new Error("No se pudo identificar el nombre del jinete o del ejemplar en el texto recibido.");
    error.status = 400;
    throw error;
  }

  const fecha = new Date().toISOString();

  const docRef = await addDoc(collection(db, "inscripcionesCabalgata"), {
    nombreCompleto,
    cedula,
    telefono,
    contacto,
    municipio,
    esMayorDeEdad,
    aceptaArticuloSexto,
    aceptaArticuloSeptimo,
    nombreEjemplar,
    edadEquino,
    tieneMicrochip,
    numeroMicrochip,
    soportePago,
    fecha,
    // Texto original, por si la extracción se equivocó en algo y hay que revisar a mano.
    datosJineteTexto,
    datosEquinoTexto,
  });

  // Firestore ya quedó guardado (es la fuente de verdad) — si el espejo a
  // Sheets falla por lo que sea (Google caído, credenciales vencidas), no vale
  // la pena que el cliente del bot vea un error ni que Lucid reintente y quizás
  // duplique el registro. Se deja loggeado para revisar manualmente.
  try {
    await agregarFila(TITULO_SHEET, NOMBRE_HOJA, ENCABEZADOS, [
      fecha,
      nombreCompleto,
      cedula,
      telefono,
      contacto,
      municipio,
      esMayorDeEdad,
      aceptaArticuloSexto,
      aceptaArticuloSeptimo,
      nombreEjemplar,
      edadEquino,
      tieneMicrochip,
      numeroMicrochip,
      soportePago,
    ]);
  } catch (err) {
    console.error(`No se pudo espejar a Google Sheets la inscripción ${docRef.id} (sí quedó en Firestore):`, err);
  }

  return { id: docRef.id };
}

module.exports = { registrarInscripcionCabalgata };
