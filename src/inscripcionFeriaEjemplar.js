// Un ejemplar + su montador, para la inscripción a la Feria. Se llama una vez
// por cada vuelta del loop en Lucid (no se espera al final) — así, si alguien
// deja la conversación a la mitad, los ejemplares que ya mandó no se pierden.
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarEjemplarMontador } = require("./organizarDatosFeria");
const { escribirEjemplar } = require("./sheetsFeria");

function generarLoteId() {
  return "LOTE-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

async function registrarEjemplarFeria(datos = {}) {
  const { loteId, datosEjemplarTexto = "", sexo = "", datosMontadorTexto = "" } = datos;

  if (!datosEjemplarTexto || !sexo || !datosMontadorTexto) {
    const error = new Error("Faltan campos obligatorios: datosEjemplarTexto, sexo y datosMontadorTexto.");
    error.status = 400;
    throw error;
  }
  if (!["HEMBRA", "MACHO"].includes(sexo.trim().toUpperCase())) {
    const error = new Error('sexo debe ser "Hembra" o "Macho".');
    error.status = 400;
    throw error;
  }

  const sexoNormalizado = sexo.trim().toUpperCase();
  const loteIdFinal = loteId && loteId.trim() ? loteId.trim() : generarLoteId();

  const {
    nombreEjemplar,
    registro,
    criaderoDondePasta,
    modalidad,
    categoria,
    nombreMontador,
    documentoMontador,
    telefonoMontador,
  } = await organizarEjemplarMontador(datosEjemplarTexto, sexoNormalizado, datosMontadorTexto);

  if (!nombreEjemplar || !nombreMontador) {
    const error = new Error("No se pudo identificar el nombre del ejemplar o del montador en el texto recibido.");
    error.status = 400;
    throw error;
  }

  const fecha = new Date().toISOString();

  const docRef = await addDoc(collection(db, "inscripcionesFeriaEjemplares"), {
    loteId: loteIdFinal,
    nombreEjemplar,
    registro,
    criaderoDondePasta,
    sexo: sexoNormalizado,
    modalidad,
    categoria,
    nombreMontador,
    documentoMontador,
    telefonoMontador,
    fecha,
    datosEjemplarTexto,
    datosMontadorTexto,
  });

  // Firestore ya quedó guardado (fuente de verdad). El Sheet es un espejo para
  // el organizador — si falla o si el cupo de ese bloque ya está lleno, no se
  // pierde el registro, solo se marca para que alguien lo revise a mano.
  let sheet = { escrito: false, motivo: "error" };
  try {
    sheet = await escribirEjemplar({ modalidad, sexo: sexoNormalizado, categoria, nombreEjemplar, registro, criaderoDondePasta, nombreMontador });
    if (!sheet.escrito) {
      console.warn(`Ejemplar ${docRef.id} no se pudo escribir en el Sheet (${sheet.motivo}) — sigue guardado en Firestore.`);
    }
  } catch (err) {
    console.error(`Error escribiendo en el Sheet el ejemplar ${docRef.id} (sí quedó en Firestore):`, err);
  }

  return {
    id: docRef.id,
    loteId: loteIdFinal,
    cupoLleno: sheet.motivo === "cupo_lleno",
    escritoEnSheet: sheet.escrito === true,
  };
}

module.exports = { registrarEjemplarFeria };
