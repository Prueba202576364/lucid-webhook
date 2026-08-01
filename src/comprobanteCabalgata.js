// Completa el comprobante de pago de un binomio que ya quedó registrado —
// se llama en un paso aparte, después de que Lucid confirmó que la
// inscripción (jinete + equino) se guardó bien y ya validó que lo que llegó
// es un link real de archivo (no solo texto).
const { collection, query, where, getDocs, doc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { actualizarCelda } = require("./sheets");

const B = (v) => (v ? "true" : "false");
const COL_SOPORTE_PAGO = "N"; // última columna del encabezado, ver inscripcionCabalgata.js

async function registrarComprobanteCabalgata(datos = {}) {
  const { loteId, soportePago = "" } = datos;

  if (!loteId || !loteId.trim() || !soportePago) {
    const error = new Error("Faltan campos obligatorios: loteId y soportePago.");
    error.status = 400;
    throw error;
  }

  const q = query(collection(db, "inscripcionesCabalgata"), where("loteId", "==", loteId.trim()));
  const snap = await getDocs(q);
  if (snap.empty) {
    const error = new Error("No se encontró ninguna inscripción con ese loteId.");
    error.status = 400;
    throw error;
  }

  const registro = snap.docs[0];
  await updateDoc(doc(db, "inscripcionesCabalgata", registro.id), { soportePago });

  let escritoEnSheet = false;
  const { sheetFila, sheetHoja } = registro.data();
  if (sheetFila && sheetHoja) {
    try {
      await actualizarCelda(sheetHoja, COL_SOPORTE_PAGO, sheetFila, soportePago);
      escritoEnSheet = true;
    } catch (err) {
      console.error(`Error escribiendo el comprobante de ${registro.id} en el Sheet (sí quedó en Firestore):`, err);
    }
  } else {
    console.warn(`La inscripción ${registro.id} no tiene ubicación en el Sheet — comprobante solo quedó en Firestore.`);
  }

  return { ok: B(true), id: registro.id, escritoEnSheet: B(escritoEnSheet) };
}

module.exports = { registrarComprobanteCabalgata };
