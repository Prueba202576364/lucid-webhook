// Primer bloque de la inscripción a cabalgata: los datos del jinete. Crea el
// registro en Firestore (y su fila en el Sheet) apenas este bloque queda
// completo — no espera a los datos del equino. Así, si la persona abandona
// la conversación después de esto, el jinete ya quedó guardado.
const { collection, addDoc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { agregarFila } = require("./sheets");
const { organizarJinete } = require("./organizarDatos");
const { generarLoteId, loteIdValido } = require("./loteId");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarDocumento, validarTelefono, validarMunicipio } = require("./validaciones");
const { fechaColombia } = require("./fecha");

const COLECCION_BORRADORES = "cabalgataBorradores";
const B = (v) => (v ? "true" : "false");

const TITULO_SHEET = "Inscripciones Cabalgata - Expo Equinox 2026";
const NOMBRE_HOJA = "Inscripciones";
const ENCABEZADOS = [
  "Fecha inscripcion", "nombre", "cedula", "telefono", "contacto", "municipio",
  "es mayor de edad", "acepta articulo sexto", "acepta articulo septimo",
  "nombre ejemplar", "edad equino", "tiene microchip", "numero microchip", "soporte pago",
];

const SPEC_JINETE = [
  { campo: "nombreCompleto", validador: validarNombre, etiqueta: "nombre completo" },
  { campo: "cedula", validador: validarDocumento, etiqueta: "cédula" },
  { campo: "telefono", validador: validarTelefono, etiqueta: "teléfono" },
  { campo: "municipio", validador: validarMunicipio, etiqueta: "municipio" },
];

function resolverContacto(nuevo, anterior, telefonoResuelto) {
  const candidato = (nuevo && nuevo.contacto) || (anterior && anterior.contacto) || "";
  const r = validarTelefono(candidato);
  return r.valido ? r.valor : telefonoResuelto;
}

async function registrarJineteCabalgata(datos = {}) {
  const { loteId, datosJineteTexto = "", esMayorDeEdad = "", aceptaArticuloSexto = "", aceptaArticuloSeptimo = "" } = datos;

  if (!datosJineteTexto) {
    const error = new Error("Falta el campo obligatorio: datosJineteTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "jinete");
  const nuevo = await organizarJinete(datosJineteTexto, anterior);
  const res = resolverBloque(SPEC_JINETE, nuevo, anterior);
  const contactoCrudo = nuevo.contacto || (anterior && anterior.contacto) || "";

  if (!res.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "jinete", { ...res.paraGuardar, contacto: contactoCrudo });
    return {
      ok: B(false),
      loteId: loteIdFinal,
      mensajeErrorJinete: `Todavía falta: ${res.problemas.join(", ")}.`,
    };
  }

  const { nombreCompleto, cedula, telefono, municipio } = res.valores;
  const contacto = resolverContacto(nuevo, anterior, telefono);
  const fecha = fechaColombia();

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
    nombreEjemplar: "",
    edadEquino: "",
    tieneMicrochip: "",
    numeroMicrochip: "",
    soportePago: "",
    equinoCompleto: false,
    fecha,
    datosJineteTexto,
  });

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "jinete");

  // Best-effort: la fila del Sheet se crea ya mismo (con las columnas del
  // equino en blanco) para que el organizador vea el avance, y se guarda en
  // qué fila quedó para completarla cuando llegue el bloque del equino.
  try {
    const sheet = await agregarFila(TITULO_SHEET, NOMBRE_HOJA, ENCABEZADOS, [
      fecha, nombreCompleto, cedula, telefono, contacto, municipio,
      esMayorDeEdad, aceptaArticuloSexto, aceptaArticuloSeptimo,
      "", "", "", "", "",
    ]);
    await updateDoc(docRef, { sheetFila: sheet.fila, sheetHoja: sheet.nombreHoja });
  } catch (err) {
    console.error(`No se pudo espejar a Google Sheets el jinete ${docRef.id} (sí quedó en Firestore):`, err);
  }

  return {
    ok: B(true),
    loteId: loteIdFinal,
    id: docRef.id,
    mensajeErrorJinete: "",
  };
}

module.exports = { registrarJineteCabalgata };
