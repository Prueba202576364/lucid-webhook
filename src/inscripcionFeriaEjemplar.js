// Un ejemplar + su montador + su palafrenero, para la inscripción a la
// Feria. Se llama una vez por cada vuelta del loop en Lucid (no se espera al
// final) — así, si alguien deja la conversación a la mitad, los ejemplares
// que ya mandó no se pierden.
//
// Cada uno de los 3 bloques (ejemplar, montador, palafrenero) se valida y se
// combina por separado con lo que ya se tenía guardado en el borrador — así,
// si a alguno le falta un dato, se le pide solo ese, y lo que ya estaba bien
// en los otros dos (o en el mismo bloque) no se pierde.
const { collection, addDoc, query, where, getDocs } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { extraerEjemplarMontador, obtenerCategoriasReales, elegirCategoriaReal } = require("./organizarDatosFeria");
const { escribirEjemplar, escribirEjemplarGeneral } = require("./sheetsFeria");
const { generarLoteId, loteIdValido } = require("./loteId");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradoresFeria");
const { validarNombre, validarDocumento, validarTelefono, validarTextoLibre, validarRegistro } = require("./validacionesFeria");

const B = (v) => (v ? "true" : "false");

const SPEC_EJEMPLAR = [
  { campo: "nombreEjemplar", validador: validarTextoLibre, etiqueta: "nombre del ejemplar" },
  { campo: "registro", validador: validarRegistro, etiqueta: "número de registro" },
  { campo: "criaderoDondePasta", validador: validarTextoLibre, etiqueta: "criadero donde pasta" },
];
const SPEC_MONTADOR = [
  { campo: "nombreMontador", validador: validarNombre, etiqueta: "nombre del montador" },
  { campo: "documentoMontador", validador: validarDocumento, etiqueta: "documento del montador" },
  { campo: "telefonoMontador", validador: validarTelefono, etiqueta: "teléfono del montador" },
];
const SPEC_PALAFRENERO = [
  { campo: "nombrePalafrenero", validador: validarNombre, etiqueta: "nombre del palafrenero" },
  { campo: "telefonoPalafrenero", validador: validarTelefono, etiqueta: "teléfono del palafrenero" },
];

async function registrarEjemplarFeria(datos = {}) {
  const { loteId, datosEjemplarTexto = "", datosMontadorTexto = "", datosPalafreneroTexto = "" } = datos;

  if (!datosEjemplarTexto || !datosMontadorTexto || !datosPalafreneroTexto) {
    const error = new Error("Faltan campos obligatorios: datosEjemplarTexto, datosMontadorTexto y datosPalafreneroTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(loteIdFinal, "ejemplarActual");
  const nuevo = await extraerEjemplarMontador(datosEjemplarTexto, datosMontadorTexto, datosPalafreneroTexto, anterior);

  // Sexo/Modalidad/Categoría son de lista cerrada — Claude está OBLIGADO a
  // devolver algo aunque el reintento sea un texto corto que no los
  // menciona. Por eso, si ya se habían resuelto antes, se conservan tal
  // cual en vez de dejar que un reintento parcial los adivine de nuevo.
  const sexo = (anterior && anterior.sexo) || nuevo.sexo;
  const modalidad = (anterior && anterior.modalidad) || nuevo.modalidad;
  const categoriaTexto = (anterior && anterior.categoriaTexto) || nuevo.categoriaTexto;

  const resEjemplar = resolverBloque(SPEC_EJEMPLAR, nuevo, anterior);
  const resMontador = resolverBloque(SPEC_MONTADOR, nuevo, anterior);
  const resPalafrenero = resolverBloque(SPEC_PALAFRENERO, nuevo, anterior);

  if (!resEjemplar.valido || !resMontador.valido || !resPalafrenero.valido) {
    await guardarSeccion(loteIdFinal, "ejemplarActual", {
      ...resEjemplar.paraGuardar,
      ...resMontador.paraGuardar,
      ...resPalafrenero.paraGuardar,
      sexo,
      modalidad,
      categoriaTexto,
    });
    return {
      ok: B(false),
      loteId: loteIdFinal,
      errorEjemplar: B(!resEjemplar.valido),
      errorMontador: B(!resMontador.valido),
      errorPalafrenero: B(!resPalafrenero.valido),
      mensajeErrorEjemplar: resEjemplar.valido ? "" : `Todavía falta: ${resEjemplar.problemas.join(", ")}.`,
      mensajeErrorMontador: resMontador.valido ? "" : `Todavía falta: ${resMontador.problemas.join(", ")}.`,
      mensajeErrorPalafrenero: resPalafrenero.valido ? "" : `Todavía falta: ${resPalafrenero.problemas.join(", ")}.`,
    };
  }

  // Los 3 bloques de texto quedaron bien — ahora sí se resuelve la
  // categoría real (depende del Sexo/Modalidad ya definitivos).
  const categoriasReales = await obtenerCategoriasReales(modalidad, sexo);
  const categoria = await elegirCategoriaReal(categoriaTexto, categoriasReales);

  const { nombreEjemplar, registro, criaderoDondePasta } = resEjemplar.valores;
  const { nombreMontador, documentoMontador, telefonoMontador } = resMontador.valores;
  const { nombrePalafrenero, telefonoPalafrenero } = resPalafrenero.valores;

  const fecha = new Date().toISOString();

  const docRef = await addDoc(collection(db, "inscripcionesFeriaEjemplares"), {
    loteId: loteIdFinal,
    nombreEjemplar,
    registro,
    criaderoDondePasta,
    sexo,
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

  await limpiarSeccion(loteIdFinal, "ejemplarActual");

  // Firestore ya quedó guardado (fuente de verdad). El Sheet es un espejo para
  // el organizador — si falla o si el cupo de ese bloque ya está lleno, no se
  // pierde el registro, solo se marca para que alguien lo revise a mano.
  let sheet = { escrito: false, motivo: "error" };
  try {
    sheet = await escribirEjemplar({
      modalidad,
      sexo,
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

  // Best-effort también: agrega el bloque de este ejemplar a la fila del
  // propietario en "Información general" — necesita saber en qué fila quedó
  // el propietario y qué número de ejemplar es este dentro del mismo lote.
  try {
    const qPropietario = query(collection(db, "inscripcionesFeriaPropietarios"), where("loteId", "==", loteIdFinal));
    const snapPropietario = await getDocs(qPropietario);
    if (!snapPropietario.empty) {
      const infoGeneralFila = snapPropietario.docs[0].data().infoGeneralFila;
      if (infoGeneralFila) {
        const qEjemplaresPrevios = query(collection(db, "inscripcionesFeriaEjemplares"), where("loteId", "==", loteIdFinal));
        const snapEjemplaresPrevios = await getDocs(qEjemplaresPrevios);
        const numeroEjemplar = snapEjemplaresPrevios.size; // ya incluye el que se acaba de guardar
        await escribirEjemplarGeneral({
          fila: infoGeneralFila,
          numeroEjemplar,
          nombreEjemplar, registro, categoria, modalidad, criaderoDondePasta,
          nombreMontador, documentoMontador, telefonoMontador,
          nombrePalafrenero, telefonoPalafrenero,
        });
      } else {
        console.warn(`Propietario del lote ${loteIdFinal} no tiene fila en "Información general" — se omite ese espejo para el ejemplar ${docRef.id}.`);
      }
    } else {
      console.warn(`No se encontró propietario para el lote ${loteIdFinal} — se omite el espejo en "Información general" para el ejemplar ${docRef.id}.`);
    }
  } catch (err) {
    console.error(`Error escribiendo el ejemplar ${docRef.id} en "Información general" (sí quedó en Firestore):`, err);
  }

  const resumen =
    `Nombre: ${nombreEjemplar}\nRegistro: ${registro}\nSexo: ${sexo}\nModalidad: ${modalidad}\nCategoría: ${categoria}\n` +
    `Criadero: ${criaderoDondePasta}\nMontador: ${nombreMontador}\nPalafrenero: ${nombrePalafrenero}`;

  return {
    ok: B(true),
    id: docRef.id,
    loteId: loteIdFinal,
    cupoLleno: B(sheet.motivo === "cupo_lleno"),
    escritoEnSheet: B(sheet.escrito === true),
    errorEjemplar: B(false),
    errorMontador: B(false),
    errorPalafrenero: B(false),
    mensajeErrorEjemplar: "",
    mensajeErrorMontador: "",
    mensajeErrorPalafrenero: "",
    resumen,
  };
}

module.exports = { registrarEjemplarFeria };
