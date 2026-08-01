// Recuerda, entre intentos fallidos, lo que ya se logró capturar bien de un
// bloque de datos — así, cuando la persona reenvía solo el dato que faltó,
// se combina con lo anterior en vez de partir de cero. Un documento por
// llave (loteId u otro identificador de intento), con una sección por cada
// bloque que se esté llenando; cada llamador usa su propia colección de
// Firestore para no mezclar borradores de flujos distintos.
const { doc, getDoc, setDoc, deleteField } = require("firebase/firestore");
const { db } = require("./firebaseClient");

function refBorrador(coleccion, llave) {
  return doc(db, coleccion, llave);
}

async function obtenerSeccion(coleccion, llave, seccion) {
  const snap = await getDoc(refBorrador(coleccion, llave));
  if (!snap.exists()) return null;
  return snap.data()[seccion] || null;
}

async function guardarSeccion(coleccion, llave, seccion, datos) {
  await setDoc(refBorrador(coleccion, llave), { [seccion]: datos }, { merge: true });
}

async function limpiarSeccion(coleccion, llave, seccion) {
  await setDoc(refBorrador(coleccion, llave), { [seccion]: deleteField() }, { merge: true });
}

// Resuelve un bloque de campos combinando el intento nuevo con lo que ya se
// tenía guardado. "spec" es un array de { campo, validador, etiqueta } — por
// cada uno: si el valor nuevo pasa el validador, se usa; si no, se prueba
// con el valor anterior (del borrador); si ninguno sirve, se reporta el
// problema del más reciente (para que el mensaje refleje el último intento).
function resolverBloque(spec, nuevo, anterior) {
  const valores = {};
  const paraGuardar = {};
  const problemas = [];

  for (const { campo, validador, etiqueta } of spec) {
    const nuevoRaw = nuevo ? nuevo[campo] : "";
    const anteriorRaw = anterior ? anterior[campo] : "";

    const rNuevo = validador(nuevoRaw);
    if (rNuevo.valido) {
      valores[campo] = rNuevo.valor;
      paraGuardar[campo] = nuevoRaw;
      continue;
    }
    const rAnterior = validador(anteriorRaw);
    if (rAnterior.valido) {
      valores[campo] = rAnterior.valor;
      paraGuardar[campo] = anteriorRaw;
      continue;
    }
    paraGuardar[campo] = nuevoRaw || anteriorRaw || "";
    problemas.push(`${etiqueta} (${rNuevo.motivo})`);
  }

  return { valido: problemas.length === 0, valores, paraGuardar, problemas };
}

module.exports = { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque };
