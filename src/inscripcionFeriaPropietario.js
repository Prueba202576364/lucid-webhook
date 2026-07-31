// Datos del propietario/criadero para la Feria — se recolecta una sola vez,
// antes de entrar al loop de ejemplares. Genera el loteId que después se
// reutiliza en cada ejemplar de ese mismo criadero.
const { collection, addDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarPropietario } = require("./organizarDatosFeria");
const { generarLoteId, loteIdValido } = require("./loteId");

const VACIO = (v) => !v || !v.toString().trim();

async function registrarPropietarioFeria(datos = {}) {
  const { loteId, datosPropietarioTexto = "" } = datos;

  if (!datosPropietarioTexto) {
    const error = new Error("Falta el campo obligatorio: datosPropietarioTexto.");
    error.status = 400;
    throw error;
  }

  const {
    nombrePropietario,
    documentoPropietario,
    telefonoPropietario,
    correoPropietario,
    municipioPropietario,
  } = await organizarPropietario(datosPropietarioTexto);

  const faltantes = [];
  if (VACIO(nombrePropietario)) faltantes.push("nombre completo o razón social");
  if (VACIO(documentoPropietario)) faltantes.push("tipo y número de documento");
  if (VACIO(telefonoPropietario)) faltantes.push("teléfono");
  if (VACIO(correoPropietario)) faltantes.push("correo electrónico");
  if (VACIO(municipioPropietario)) faltantes.push("municipio");

  // No se guarda nada si falta algo — se pide reenviar el bloque completo,
  // igual que con ejemplar/montador/palafrenero.
  if (faltantes.length > 0) {
    return {
      ok: false,
      mensajeError: `Del propietario faltó: ${faltantes.join(", ")}.`,
    };
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();
  const fecha = new Date().toISOString();

  const docRef = await addDoc(collection(db, "inscripcionesFeriaPropietarios"), {
    loteId: loteIdFinal,
    nombrePropietario,
    documentoPropietario,
    telefonoPropietario,
    correoPropietario,
    municipioPropietario,
    fecha,
    datosPropietarioTexto,
  });

  return { ok: true, id: docRef.id, loteId: loteIdFinal, mensajeError: "" };
}

module.exports = { registrarPropietarioFeria };
