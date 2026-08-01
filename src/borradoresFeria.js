// Recuerda, entre intentos fallidos, lo que ya se logró capturar bien de un
// bloque (propietario o el ejemplar que esté en curso) — así, cuando la
// persona reenvía solo el dato que faltó, se combina con lo anterior en vez
// de partir de cero. Un documento por loteId, con dos secciones: la del
// propietario (una sola vez) y la del ejemplar actual (se reinicia cada vez
// que uno se guarda con éxito, para no arrastrar datos al siguiente).
const { doc, getDoc, setDoc, deleteField } = require("firebase/firestore");
const { db } = require("./firebaseClient");

function refBorrador(loteId) {
  return doc(db, "feriaBorradores", loteId);
}

async function obtenerSeccion(loteId, seccion) {
  const snap = await getDoc(refBorrador(loteId));
  if (!snap.exists()) return null;
  return snap.data()[seccion] || null;
}

async function guardarSeccion(loteId, seccion, datos) {
  await setDoc(refBorrador(loteId), { [seccion]: datos }, { merge: true });
}

async function limpiarSeccion(loteId, seccion) {
  await setDoc(refBorrador(loteId), { [seccion]: deleteField() }, { merge: true });
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
