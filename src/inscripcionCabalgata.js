// Inscripción de un binomio (jinete + equino) para la cabalgata, recolectada por
// el flujo de WhatsApp en Lucid. Guarda en Firestore (fuente de verdad) y en el
// mismo momento agrega una fila al Google Sheet (para que el organizador la vea
// sin entrar a Firebase).
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { agregarFila } = require("./sheets");

const TITULO_SHEET = "Inscripciones Cabalgata - Expo Equinox 2026";
const NOMBRE_HOJA = "Inscripciones";

const ENCABEZADOS = [
  "Fecha",
  "Nombre completo",
  "Cédula",
  "Teléfono",
  "Contacto",
  "Es mayor de edad",
  "Acepta decreto 106",
  "Acepta artículo séptimo",
  "Nombre del ejemplar",
  "Edad del equino",
  "Tiene microchip",
  "Número de microchip",
];

async function registrarInscripcionCabalgata(datos = {}) {
  const {
    nombreCompleto = "",
    cedula = "",
    telefono = "",
    contacto = "",
    esMayorDeEdad = "",
    aceptaDecreto106 = "",
    aceptaArticuloSeptimo = "",
    nombreEjemplar = "",
    edadEquino = "",
    tieneMicrochip = "",
    numeroMicrochip = "",
  } = datos;

  if (!nombreCompleto || !nombreEjemplar) {
    const error = new Error("Faltan campos obligatorios: nombreCompleto y nombreEjemplar.");
    error.status = 400;
    throw error;
  }

  const fecha = new Date().toISOString();

  const docRef = await addDoc(collection(db, "inscripcionesCabalgata"), {
    nombreCompleto,
    cedula,
    telefono,
    contacto,
    esMayorDeEdad,
    aceptaDecreto106,
    aceptaArticuloSeptimo,
    nombreEjemplar,
    edadEquino,
    tieneMicrochip,
    numeroMicrochip,
    fecha,
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
      esMayorDeEdad,
      aceptaDecreto106,
      aceptaArticuloSeptimo,
      nombreEjemplar,
      edadEquino,
      tieneMicrochip,
      numeroMicrochip,
    ]);
  } catch (err) {
    console.error(`No se pudo espejar a Google Sheets la inscripción ${docRef.id} (sí quedó en Firestore):`, err);
  }

  return { id: docRef.id };
}

module.exports = { registrarInscripcionCabalgata };
