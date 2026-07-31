// Un ejemplar + su montador + su palafrenero, para la inscripción a la
// Feria. Se llama una vez por cada vuelta del loop en Lucid (no se espera al
// final) — así, si alguien deja la conversación a la mitad, los ejemplares
// que ya mandó no se pierden.
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarEjemplarCompleto } = require("./organizarDatosFeria");
const { escribirEjemplar } = require("./sheetsFeria");
const { generarLoteId, loteIdValido } = require("./loteId");

const VACIO = (v) => !v || !v.toString().trim();

// Revisa cada uno de los 3 bloques por separado, para poder decirle a Lucid
// exactamente cuál volver a pedir (no los tres) en vez de solo "algo falló".
function validarBloques(extraido) {
  const faltantesEjemplar = [];
  if (VACIO(extraido.nombreEjemplar)) faltantesEjemplar.push("nombre del ejemplar");
  if (VACIO(extraido.registro)) faltantesEjemplar.push("número de registro");
  if (VACIO(extraido.criaderoDondePasta)) faltantesEjemplar.push("criadero donde pasta");

  const faltantesMontador = [];
  if (VACIO(extraido.nombreMontador)) faltantesMontador.push("nombre del montador");
  if (VACIO(extraido.documentoMontador)) faltantesMontador.push("documento del montador");
  if (VACIO(extraido.telefonoMontador)) faltantesMontador.push("teléfono del montador");

  const faltantesPalafrenero = [];
  if (VACIO(extraido.nombrePalafrenero)) faltantesPalafrenero.push("nombre del palafrenero");
  if (VACIO(extraido.telefonoPalafrenero)) faltantesPalafrenero.push("teléfono del palafrenero");

  const errorEjemplar = faltantesEjemplar.length > 0;
  const errorMontador = faltantesMontador.length > 0;
  const errorPalafrenero = faltantesPalafrenero.length > 0;

  const partes = [];
  if (errorEjemplar) partes.push(`Del ejemplar faltó: ${faltantesEjemplar.join(", ")}.`);
  if (errorMontador) partes.push(`Del montador faltó: ${faltantesMontador.join(", ")}.`);
  if (errorPalafrenero) partes.push(`Del palafrenero faltó: ${faltantesPalafrenero.join(", ")}.`);

  return {
    valido: !errorEjemplar && !errorMontador && !errorPalafrenero,
    errorEjemplar,
    errorMontador,
    errorPalafrenero,
    mensajeError: partes.join(" "),
  };
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

  const validacion = validarBloques({
    nombreEjemplar, registro, criaderoDondePasta,
    nombreMontador, documentoMontador, telefonoMontador,
    nombrePalafrenero, telefonoPalafrenero,
  });

  // No se guarda nada todavía si falta algo — así Lucid puede volver a pedir
  // solo el bloque incompleto y reintentar, sin dejar un registro a medias.
  if (!validacion.valido) {
    return {
      ok: false,
      loteId: loteIdFinal,
      errorEjemplar: validacion.errorEjemplar,
      errorMontador: validacion.errorMontador,
      errorPalafrenero: validacion.errorPalafrenero,
      mensajeError: validacion.mensajeError,
    };
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
    ok: true,
    id: docRef.id,
    loteId: loteIdFinal,
    cupoLleno: sheet.motivo === "cupo_lleno",
    escritoEnSheet: sheet.escrito === true,
    errorEjemplar: false,
    errorMontador: false,
    errorPalafrenero: false,
    mensajeError: "",
  };
}

module.exports = { registrarEjemplarFeria };
