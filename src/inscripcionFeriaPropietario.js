// Datos del propietario/criadero para la Feria — se recolecta una sola vez,
// antes de entrar al loop de ejemplares. Genera el loteId que después se
// reutiliza en cada ejemplar de ese mismo criadero.
//
// El loteId se resuelve SIEMPRE al principio (exista o no todavía el
// registro final) porque se usa como llave del borrador — así, si falta un
// dato, se puede pedir solo ese y combinarlo con lo que ya se tenía cuando
// la persona reintente.
const { collection, addDoc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarPropietario } = require("./organizarDatosFeria");
const { generarLoteId, loteIdValido } = require("./loteId");
const { escribirPropietarioGeneral } = require("./sheetsFeria");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarDocumento, validarTelefono, validarCorreo, validarMunicipio } = require("./validaciones");
const { fechaColombia } = require("./fecha");

const COLECCION_BORRADORES = "feriaBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_PROPIETARIO = [
  { campo: "nombrePropietario", validador: validarNombre, etiqueta: "nombre completo o razón social" },
  { campo: "documentoPropietario", validador: validarDocumento, etiqueta: "tipo y número de documento" },
  { campo: "telefonoPropietario", validador: validarTelefono, etiqueta: "teléfono" },
  { campo: "correoPropietario", validador: validarCorreo, etiqueta: "correo electrónico" },
  { campo: "municipioPropietario", validador: validarMunicipio, etiqueta: "municipio" },
];

async function registrarPropietarioFeria(datos = {}) {
  const { loteId, datosPropietarioTexto = "" } = datos;

  if (!datosPropietarioTexto) {
    const error = new Error("Falta el campo obligatorio: datosPropietarioTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "propietario");
  const nuevo = await organizarPropietario(datosPropietarioTexto, anterior);
  const { valido, valores, paraGuardar, problemas } = resolverBloque(SPEC_PROPIETARIO, nuevo, anterior);

  if (!valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "propietario", paraGuardar);
    return {
      ok: B(false),
      loteId: loteIdFinal,
      mensajeError: `Todavía falta: ${problemas.join(", ")}.`,
    };
  }

  const { nombrePropietario, documentoPropietario, telefonoPropietario, correoPropietario, municipioPropietario } = valores;
  const fecha = fechaColombia();

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

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "propietario");

  // Best-effort: si falla, el propietario sigue guardado en Firestore, solo
  // no queda espejado en "Información general" (se puede completar a mano).
  try {
    const sheet = await escribirPropietarioGeneral({ nombrePropietario, documentoPropietario, telefonoPropietario, correoPropietario, municipioPropietario });
    await updateDoc(docRef, { infoGeneralFila: sheet.fila });
  } catch (err) {
    console.error(`Error escribiendo el propietario ${docRef.id} en "Información general" (sí quedó en Firestore):`, err);
  }

  const resumen = `Propietario: ${nombrePropietario}\nDocumento: ${documentoPropietario}\nTeléfono: ${telefonoPropietario}\nCorreo: ${correoPropietario}\nMunicipio: ${municipioPropietario}`;

  return { ok: B(true), id: docRef.id, loteId: loteIdFinal, mensajeError: "", resumen };
}

module.exports = { registrarPropietarioFeria };
