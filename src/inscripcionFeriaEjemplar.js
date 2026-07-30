// Un ejemplar + su montador, para la inscripción a la Feria. Se llama una vez
// por cada vuelta del loop en Lucid (no se espera al final) — así, si alguien
// deja la conversación a la mitad, los ejemplares que ya mandó no se pierden.
const { collection, addDoc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarEjemplarMontador } = require("./organizarDatosFeria");
const { escribirEjemplar } = require("./sheetsFeria");

function generarLoteId() {
  return "LOTE-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// Si en Lucid el campo personalizado del loteId todavía no existe o no se
// llenó, la variable "{{...}}" puede llegar sin resolver, tal cual, como
// texto — hay que tratar eso como si no hubiera llegado nada.
function loteIdValido(loteId) {
  return typeof loteId === "string" && loteId.trim() && !loteId.includes("{{");
}

async function registrarEjemplarFeria(datos = {}) {
  const { loteId, datosEjemplarTexto = "", datosMontadorTexto = "" } = datos;

  if (!datosEjemplarTexto || !datosMontadorTexto) {
    const error = new Error("Faltan campos obligatorios: datosEjemplarTexto y datosMontadorTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const {
    nombreEjemplar,
    registro,
    criaderoDondePasta,
    sexo: sexoNormalizado,
    modalidad,
    categoria,
    nombreMontador,
    documentoMontador,
    telefonoMontador,
  } = await organizarEjemplarMontador(datosEjemplarTexto, datosMontadorTexto);

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
    } else {
      // Se guarda dónde quedó exactamente (pestaña + fila) para que, cuando
      // llegue el palafrenero de este ejemplar en su propio loop, se pueda
      // completar esa misma fila sin tener que volver a buscar el bloque.
      await updateDoc(docRef, { sheetPestana: sheet.pestana, sheetFila: sheet.fila });
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
