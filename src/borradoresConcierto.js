// Mismo patrón de "borrador" que borradores.js (recordar entre intentos
// fallidos lo que ya se capturó bien de un bloque), pero para el proyecto
// Firebase del concierto vía Admin SDK — la API de lectura/escritura es
// distinta a la del SDK de cliente que usa borradores.js, así que no se
// puede reutilizar tal cual. resolverBloque() sí es una función pura (no
// toca Firestore) y se reutiliza directo desde borradores.js.
const { dbConcierto } = require("./firebaseAdminConcierto");
const { FieldValue } = require("firebase-admin/firestore");

function refBorrador(coleccion, llave) {
  return dbConcierto.collection(coleccion).doc(llave);
}

async function obtenerSeccion(coleccion, llave, seccion) {
  const snap = await refBorrador(coleccion, llave).get();
  if (!snap.exists) return null;
  return snap.data()[seccion] || null;
}

async function guardarSeccion(coleccion, llave, seccion, datos) {
  await refBorrador(coleccion, llave).set({ [seccion]: datos }, { merge: true });
}

async function limpiarSeccion(coleccion, llave, seccion) {
  await refBorrador(coleccion, llave).set({ [seccion]: FieldValue.delete() }, { merge: true });
}

module.exports = { obtenerSeccion, guardarSeccion, limpiarSeccion };
