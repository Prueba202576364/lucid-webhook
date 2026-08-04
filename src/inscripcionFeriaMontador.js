// Segundo bloque del ejemplar de feria: los datos del montador. Completa el
// registro que ya creó el bloque del ejemplar (buscándolo por loteId, el que
// todavía no tenga montador) — no crea nada nuevo.
const { collection, query, where, getDocs, doc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { completarMontador } = require("./sheetsFeria");
const { extraerMontador } = require("./organizarDatosFeria");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarDocumento, validarTelefono } = require("./validaciones");

const COLECCION_BORRADORES = "feriaBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_MONTADOR = [
  { campo: "nombreMontador", validador: validarNombre, etiqueta: "nombre del montador" },
  { campo: "documentoMontador", validador: validarDocumento, etiqueta: "documento del montador" },
  { campo: "telefonoMontador", validador: validarTelefono, etiqueta: "teléfono del montador" },
];

async function registrarMontador(datos = {}) {
  const { loteId, datosMontadorTexto = "" } = datos;

  if (!loteId || !loteId.trim() || !datosMontadorTexto) {
    const error = new Error("Faltan campos obligatorios: loteId y datosMontadorTexto.");
    error.status = 400;
    throw error;
  }

  const q = query(collection(db, "inscripcionesFeriaEjemplares"), where("loteId", "==", loteId.trim()));
  const snap = await getDocs(q);
  const pendiente = snap.docs.find((d) => d.data().montadorCompleto === false);
  if (!pendiente) {
    const error = new Error("No se encontró un ejemplar pendiente de montador para ese loteId — primero hay que registrar el ejemplar.");
    error.status = 400;
    throw error;
  }

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteId.trim(), "montadorActual");
  const nuevo = await extraerMontador(datosMontadorTexto, anterior);
  const res = resolverBloque(SPEC_MONTADOR, nuevo, anterior);

  if (!res.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteId.trim(), "montadorActual", res.paraGuardar);
    return {
      ok: B(false),
      mensajeErrorMontador: `Todavía falta: ${res.problemas.join(", ")}.`,
    };
  }

  const { nombreMontador, documentoMontador, telefonoMontador } = res.valores;

  await updateDoc(doc(db, "inscripcionesFeriaEjemplares", pendiente.id), {
    nombreMontador,
    documentoMontador,
    telefonoMontador,
    montadorCompleto: true,
    datosMontadorTexto,
  });

  await limpiarSeccion(COLECCION_BORRADORES, loteId.trim(), "montadorActual");

  const { sheetPestana, sheetFila, sexo } = pendiente.data();
  let escritoEnSheet = false;
  if (sheetPestana && sheetFila) {
    try {
      await completarMontador({ pestana: sheetPestana, fila: sheetFila, sexo, nombreMontador });
      escritoEnSheet = true;
    } catch (err) {
      console.error(`Error completando el montador de ${pendiente.id} en el Sheet (sí quedó en Firestore):`, err);
    }
  } else {
    console.warn(`El ejemplar ${pendiente.id} no tiene ubicación en el Sheet — montador solo quedó en Firestore.`);
  }

  return {
    ok: B(true),
    id: pendiente.id,
    escritoEnSheet: B(escritoEnSheet),
    mensajeErrorMontador: "",
  };
}

module.exports = { registrarMontador };
