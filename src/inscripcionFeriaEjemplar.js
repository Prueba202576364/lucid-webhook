// Un ejemplar + su montador + su palafrenero, para la inscripción a la
// Feria. Se llama una vez por cada vuelta del loop en Lucid (no se espera al
// final) — así, si alguien deja la conversación a la mitad, los ejemplares
// que ya mandó no se pierden.
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarEjemplarCompleto } = require("./organizarDatosFeria");
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
  const { loteId, datosEjemplarTexto = "", datosMontadorTexto = "", datosPalafreneroTexto = "" } = datos;

  if (!datosEjemplarTexto || !datosMontadorTexto || !datosPalafreneroTexto) {
    const error = new Error("Faltan campos obligatorios: datosEjemplarTexto, datosMontadorTexto y datosPalafreneroTexto.");
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
    nombrePalafrenero,
    telefonoPalafrenero,
  } = await organizarEjemplarCompleto(datosEjemplarTexto, datosMontadorTexto, datosPalafreneroTexto);

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
    nombrePalafrenero,
    telefonoPalafrenero,
    fecha,
    datosEjemplarTexto,
    datosMontadorTexto,
    datosPalafreneroTexto,
  });

  // Firestore ya quedó guardado (fuente de verdad). El Sheet es un espejo para
  // el organizador — si falla o si el cupo de ese bloque ya está lleno, no se
  // pierde el registro, solo se marca para que alguien lo revise a mano.
  let sheet = { escrito: false, motivo: "error" };
  try {
    sheet = await escribirEjemplar({
      modalidad,
      sexo: sexoNormalizado,
      categoria,
      nombreEjemplar,
      registro,
      criaderoDondePasta,
      nombreMontador,
      nombrePalafrenero,
      telefonoPalafrenero,
    });
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
