// Segundo bloque de la inscripción a cabalgata: los datos del equino.
// Completa el registro que ya creó el bloque del jinete (buscándolo por
// loteId) — no crea nada nuevo.
const { collection, query, where, getDocs, doc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { actualizarRango } = require("./sheets");
const { organizarEquino } = require("./organizarDatos");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarTextoLibre, validarEdad } = require("./validaciones");

const COLECCION_BORRADORES = "cabalgataBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_EQUINO = [
  { campo: "nombreEjemplar", validador: validarTextoLibre, etiqueta: "nombre del ejemplar" },
  { campo: "edadEquino", validador: validarEdad, etiqueta: "edad del equino" },
];

async function registrarEquinoCabalgata(datos = {}) {
  const { loteId, datosEquinoTexto = "" } = datos;

  if (!loteId || !loteId.trim() || !datosEquinoTexto) {
    const error = new Error("Faltan campos obligatorios: loteId y datosEquinoTexto.");
    error.status = 400;
    throw error;
  }

  const q = query(collection(db, "inscripcionesCabalgata"), where("loteId", "==", loteId.trim()));
  const snap = await getDocs(q);
  if (snap.empty) {
    const error = new Error("No se encontró el registro del jinete para ese loteId — primero hay que registrar el jinete.");
    error.status = 400;
    throw error;
  }
  const registro = snap.docs[0];

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteId.trim(), "equino");
  const nuevo = await organizarEquino(datosEquinoTexto, anterior);
  const res = resolverBloque(SPEC_EQUINO, nuevo, anterior);

  // tieneMicrochip/numeroMicrochip no llevan validación estricta.
  const tieneMicrochip = nuevo.tieneMicrochip || (anterior && anterior.tieneMicrochip) || "";
  const numeroMicrochip = nuevo.numeroMicrochip || (anterior && anterior.numeroMicrochip) || "";

  if (!res.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteId.trim(), "equino", { ...res.paraGuardar, tieneMicrochip, numeroMicrochip });
    return {
      ok: B(false),
      mensajeErrorEquino: `Todavía falta: ${res.problemas.join(", ")}.`,
    };
  }

  const { nombreEjemplar, edadEquino } = res.valores;

  await updateDoc(doc(db, "inscripcionesCabalgata", registro.id), {
    nombreEjemplar,
    edadEquino,
    tieneMicrochip,
    numeroMicrochip,
    equinoCompleto: true,
    datosEquinoTexto,
  });

  await limpiarSeccion(COLECCION_BORRADORES, loteId.trim(), "equino");

  // Best-effort: completa las columnas del equino en la misma fila que el
  // jinete ya había dejado creada (con esas columnas en blanco).
  const { sheetFila, sheetHoja } = registro.data();
  let escritoEnSheet = false;
  if (sheetFila && sheetHoja) {
    try {
      await actualizarRango(sheetHoja, "J", "M", sheetFila, [nombreEjemplar, edadEquino, tieneMicrochip, numeroMicrochip]);
      escritoEnSheet = true;
    } catch (err) {
      console.error(`Error completando el equino de ${registro.id} en el Sheet (sí quedó en Firestore):`, err);
    }
  } else {
    console.warn(`El jinete ${registro.id} no tiene ubicación en el Sheet — equino solo quedó en Firestore.`);
  }

  const datosJinete = registro.data();
  const resumen =
    `Jinete: ${datosJinete.nombreCompleto}\nCédula: ${datosJinete.cedula}\nTeléfono: ${datosJinete.telefono}\nMunicipio: ${datosJinete.municipio}\n` +
    `Ejemplar: ${nombreEjemplar}\nEdad: ${edadEquino}`;

  return {
    ok: B(true),
    id: registro.id,
    escritoEnSheet: B(escritoEnSheet),
    mensajeErrorEquino: "",
    resumen,
  };
}

module.exports = { registrarEquinoCabalgata };
