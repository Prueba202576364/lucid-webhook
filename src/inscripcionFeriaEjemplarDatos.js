// Primer bloque del ejemplar de feria: sus datos propios (nombre, registro,
// criadero, sexo, modalidad, categoría). Crea el registro en Firestore (y su
// fila en el Sheet) apenas este bloque queda completo — no espera al
// montador ni al palafrenero, que llegan después y completan este mismo
// registro (ver inscripcionFeriaMontador.js / inscripcionFeriaPalafrenero.js).
const { collection, addDoc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { extraerEjemplar, obtenerCategoriasReales, elegirCategoriaReal } = require("./organizarDatosFeria");
const { escribirEjemplar } = require("./sheetsFeria");
const { generarLoteId, loteIdValido } = require("./loteId");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarTextoLibre, validarRegistro } = require("./validaciones");
const { fechaColombia } = require("./fecha");

const COLECCION_BORRADORES = "feriaBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_EJEMPLAR = [
  { campo: "nombreEjemplar", validador: validarTextoLibre, etiqueta: "nombre del ejemplar" },
  { campo: "registro", validador: validarRegistro, etiqueta: "número de registro" },
  { campo: "criaderoDondePasta", validador: validarTextoLibre, etiqueta: "criadero donde pasta" },
];

async function registrarEjemplarDatos(datos = {}) {
  const { loteId, datosEjemplarTexto = "" } = datos;

  if (!datosEjemplarTexto) {
    const error = new Error("Falta el campo obligatorio: datosEjemplarTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "ejemplarActual");
  const nuevo = await extraerEjemplar(datosEjemplarTexto, anterior);

  // Sexo/Modalidad/Categoría son de lista cerrada — Claude está OBLIGADO a
  // devolver algo aunque el reintento sea un texto corto que no los
  // menciona. Por eso, si ya se habían resuelto antes, se conservan tal
  // cual en vez de dejar que un reintento parcial los adivine de nuevo.
  const sexo = (anterior && anterior.sexo) || nuevo.sexo;
  const modalidad = (anterior && anterior.modalidad) || nuevo.modalidad;
  const categoriaTexto = (anterior && anterior.categoriaTexto) || nuevo.categoriaTexto;

  const res = resolverBloque(SPEC_EJEMPLAR, nuevo, anterior);

  if (!res.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "ejemplarActual", { ...res.paraGuardar, sexo, modalidad, categoriaTexto });
    return {
      ok: B(false),
      loteId: loteIdFinal,
      mensajeErrorEjemplar: `Todavía falta: ${res.problemas.join(", ")}.`,
    };
  }

  const categoriasReales = await obtenerCategoriasReales(modalidad, sexo);
  const categoria = await elegirCategoriaReal(categoriaTexto, categoriasReales);

  const { nombreEjemplar, registro, criaderoDondePasta } = res.valores;
  const fecha = fechaColombia();

  const docRef = await addDoc(collection(db, "inscripcionesFeriaEjemplares"), {
    loteId: loteIdFinal,
    nombreEjemplar,
    registro,
    criaderoDondePasta,
    sexo,
    modalidad,
    categoria,
    nombreMontador: "",
    documentoMontador: "",
    telefonoMontador: "",
    nombrePalafrenero: "",
    telefonoPalafrenero: "",
    montadorCompleto: false,
    palafreneroCompleto: false,
    fecha,
    datosEjemplarTexto,
  });

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "ejemplarActual");

  // Firestore ya quedó guardado (fuente de verdad). El Sheet es un espejo —
  // si falla o si el cupo de ese bloque ya está lleno, no se pierde el
  // registro, solo se marca para que alguien lo revise a mano.
  let sheet = { escrito: false, motivo: "error" };
  try {
    sheet = await escribirEjemplar({ modalidad, sexo, categoria, nombreEjemplar, registro, criaderoDondePasta });
    if (sheet.escrito) {
      await updateDoc(docRef, { sheetPestana: sheet.pestana, sheetFila: sheet.fila });
    } else {
      console.warn(`Ejemplar ${docRef.id} no se pudo escribir en el Sheet (${sheet.motivo}) — sigue guardado en Firestore.`);
    }
  } catch (err) {
    console.error(`Error escribiendo en el Sheet el ejemplar ${docRef.id} (sí quedó en Firestore):`, err);
  }

  return {
    ok: B(true),
    loteId: loteIdFinal,
    id: docRef.id,
    cupoLleno: B(sheet.motivo === "cupo_lleno"),
    escritoEnSheet: B(sheet.escrito === true),
    mensajeErrorEjemplar: "",
  };
}

module.exports = { registrarEjemplarDatos };
