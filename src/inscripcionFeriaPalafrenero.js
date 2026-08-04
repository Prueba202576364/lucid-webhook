// Tercer y último bloque del ejemplar de feria: los datos del palafrenero.
// Completa el registro que ya crearon el ejemplar y el montador (buscándolo
// por loteId, el que todavía no tenga palafrenero) — y como ya queda todo
// completo, también espeja el ejemplar entero en "Información general".
const { collection, query, where, getDocs, doc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { completarPalafrenero, escribirEjemplarGeneral } = require("./sheetsFeria");
const { extraerPalafrenero } = require("./organizarDatosFeria");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarTelefono } = require("./validaciones");

const COLECCION_BORRADORES = "feriaBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_PALAFRENERO = [
  { campo: "nombrePalafrenero", validador: validarNombre, etiqueta: "nombre del palafrenero" },
  { campo: "telefonoPalafrenero", validador: validarTelefono, etiqueta: "teléfono del palafrenero" },
];

async function registrarPalafrenero(datos = {}) {
  const { loteId, datosPalafreneroTexto = "" } = datos;

  if (!loteId || !loteId.trim() || !datosPalafreneroTexto) {
    const error = new Error("Faltan campos obligatorios: loteId y datosPalafreneroTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteId.trim();
  const q = query(collection(db, "inscripcionesFeriaEjemplares"), where("loteId", "==", loteIdFinal));
  const snap = await getDocs(q);
  const pendiente = snap.docs.find((d) => d.data().montadorCompleto === true && d.data().palafreneroCompleto === false);
  if (!pendiente) {
    const error = new Error("No se encontró un ejemplar pendiente de palafrenero para ese loteId — primero hay que registrar el ejemplar y el montador.");
    error.status = 400;
    throw error;
  }

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "palafreneroActual");
  const nuevo = await extraerPalafrenero(datosPalafreneroTexto, anterior);
  const res = resolverBloque(SPEC_PALAFRENERO, nuevo, anterior);

  if (!res.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "palafreneroActual", res.paraGuardar);
    return {
      ok: B(false),
      mensajeErrorPalafrenero: `Todavía falta: ${res.problemas.join(", ")}.`,
    };
  }

  const { nombrePalafrenero, telefonoPalafrenero } = res.valores;
  const ejemplar = pendiente.data();

  await updateDoc(doc(db, "inscripcionesFeriaEjemplares", pendiente.id), {
    nombrePalafrenero,
    telefonoPalafrenero,
    palafreneroCompleto: true,
    datosPalafreneroTexto,
  });

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "palafreneroActual");

  let escritoEnSheet = false;
  if (ejemplar.sheetPestana && ejemplar.sheetFila) {
    try {
      await completarPalafrenero({ pestana: ejemplar.sheetPestana, fila: ejemplar.sheetFila, sexo: ejemplar.sexo, nombrePalafrenero, telefonoPalafrenero });
      escritoEnSheet = true;
    } catch (err) {
      console.error(`Error completando el palafrenero de ${pendiente.id} en el Sheet (sí quedó en Firestore):`, err);
    }
  } else {
    console.warn(`El ejemplar ${pendiente.id} no tiene ubicación en el Sheet — palafrenero solo quedó en Firestore.`);
  }

  // Ya está todo completo — se espeja el ejemplar entero en "Información
  // general" (best-effort, igual que los demás espejos a Sheets).
  try {
    const qPropietario = query(collection(db, "inscripcionesFeriaPropietarios"), where("loteId", "==", loteIdFinal));
    const snapPropietario = await getDocs(qPropietario);
    if (!snapPropietario.empty) {
      const infoGeneralFila = snapPropietario.docs[0].data().infoGeneralFila;
      if (infoGeneralFila) {
        const qEjemplares = query(collection(db, "inscripcionesFeriaEjemplares"), where("loteId", "==", loteIdFinal));
        const snapEjemplares = await getDocs(qEjemplares);
        const numeroEjemplar = snapEjemplares.size; // este ejemplar ya está incluido
        await escribirEjemplarGeneral({
          fila: infoGeneralFila,
          numeroEjemplar,
          nombreEjemplar: ejemplar.nombreEjemplar,
          registro: ejemplar.registro,
          categoria: ejemplar.categoria,
          modalidad: ejemplar.modalidad,
          criaderoDondePasta: ejemplar.criaderoDondePasta,
          nombreMontador: ejemplar.nombreMontador,
          documentoMontador: ejemplar.documentoMontador,
          telefonoMontador: ejemplar.telefonoMontador,
          nombrePalafrenero,
          telefonoPalafrenero,
        });
      } else {
        console.warn(`Propietario del lote ${loteIdFinal} no tiene fila en "Información general" — se omite ese espejo para el ejemplar ${pendiente.id}.`);
      }
    } else {
      console.warn(`No se encontró propietario para el lote ${loteIdFinal} — se omite el espejo en "Información general" para el ejemplar ${pendiente.id}.`);
    }
  } catch (err) {
    console.error(`Error escribiendo el ejemplar ${pendiente.id} en "Información general" (sí quedó en Firestore):`, err);
  }

  const resumen =
    `Nombre: ${ejemplar.nombreEjemplar}\nRegistro: ${ejemplar.registro}\nSexo: ${ejemplar.sexo}\nModalidad: ${ejemplar.modalidad}\nCategoría: ${ejemplar.categoria}\n` +
    `Criadero: ${ejemplar.criaderoDondePasta}\nMontador: ${ejemplar.nombreMontador}\nPalafrenero: ${nombrePalafrenero}`;

  return {
    ok: B(true),
    id: pendiente.id,
    escritoEnSheet: B(escritoEnSheet),
    mensajeErrorPalafrenero: "",
    resumen,
  };
}

module.exports = { registrarPalafrenero };
