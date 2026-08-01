// Inscripción de un binomio (jinete + equino) para la cabalgata, recolectada por
// el flujo de WhatsApp en Lucid. El jinete y el equino se recolectan en dos
// mensajes de texto libre (una pregunta por grupo, no una por dato) — Claude
// organiza ese texto en los campos separados antes de guardar. Guarda en
// Firestore (fuente de verdad) y en el mismo momento agrega una fila al Google
// Sheet (para que el organizador la vea sin entrar a Firebase).
//
// Igual que en la feria: si falta o está mal un dato, no se guarda nada
// todavía — se pide reenviar solo ese bloque (jinete o equino), y se combina
// con lo que ya se tenía guardado en un borrador para no perder lo demás.
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { agregarFila } = require("./sheets");
const { organizarDatosJineteEquino } = require("./organizarDatos");
const { generarLoteId, loteIdValido } = require("./loteId");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarDocumento, validarTelefono, validarMunicipio, validarTextoLibre, validarEdad } = require("./validaciones");

const COLECCION_BORRADORES = "cabalgataBorradores";
const B = (v) => (v ? "true" : "false");

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

const SPEC_JINETE = [
  { campo: "nombreCompleto", validador: validarNombre, etiqueta: "nombre completo" },
  { campo: "cedula", validador: validarDocumento, etiqueta: "cédula" },
  { campo: "telefono", validador: validarTelefono, etiqueta: "teléfono" },
  { campo: "contacto", validador: validarTelefono, etiqueta: "contacto" },
  { campo: "municipio", validador: validarMunicipio, etiqueta: "municipio" },
];
const SPEC_EQUINO = [
  { campo: "nombreEjemplar", validador: validarTextoLibre, etiqueta: "nombre del ejemplar" },
  { campo: "edadEquino", validador: validarEdad, etiqueta: "edad del equino" },
];

async function registrarInscripcionCabalgata(datos = {}) {
  const {
    loteId,
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

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "binomioActual");
  const nuevo = await organizarDatosJineteEquino(datosJineteTexto, datosEquinoTexto, anterior);

  const resJinete = resolverBloque(SPEC_JINETE, nuevo, anterior);
  const resEquino = resolverBloque(SPEC_EQUINO, nuevo, anterior);

  // tieneMicrochip/numeroMicrochip no llevan validación estricta — se guardan
  // tal cual venga (puede ser "No" y quedar sin número, es normal).
  const tieneMicrochip = nuevo.tieneMicrochip || (anterior && anterior.tieneMicrochip) || "";
  const numeroMicrochip = nuevo.numeroMicrochip || (anterior && anterior.numeroMicrochip) || "";

  if (!resJinete.valido || !resEquino.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "binomioActual", {
      ...resJinete.paraGuardar,
      ...resEquino.paraGuardar,
      tieneMicrochip,
      numeroMicrochip,
    });
    return {
      ok: B(false),
      loteId: loteIdFinal,
      errorJinete: B(!resJinete.valido),
      errorEquino: B(!resEquino.valido),
      mensajeErrorJinete: resJinete.valido ? "" : `Todavía falta: ${resJinete.problemas.join(", ")}.`,
      mensajeErrorEquino: resEquino.valido ? "" : `Todavía falta: ${resEquino.problemas.join(", ")}.`,
    };
  }

  const { nombreCompleto, cedula, telefono, contacto, municipio } = resJinete.valores;
  const { nombreEjemplar, edadEquino } = resEquino.valores;
  const fecha = new Date().toISOString();

  const docRef = await addDoc(collection(db, "inscripcionesCabalgata"), {
    loteId: loteIdFinal,
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

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "binomioActual");

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

  const resumen =
    `Jinete: ${nombreCompleto}\nCédula: ${cedula}\nTeléfono: ${telefono}\nMunicipio: ${municipio}\n` +
    `Ejemplar: ${nombreEjemplar}\nEdad: ${edadEquino}`;

  return {
    ok: B(true),
    id: docRef.id,
    loteId: loteIdFinal,
    errorJinete: B(false),
    errorEquino: B(false),
    mensajeErrorJinete: "",
    mensajeErrorEquino: "",
    resumen,
  };
}

module.exports = { registrarInscripcionCabalgata };
