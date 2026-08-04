// Primer bloque de la reserva de palco: los datos del responsable. Se valida
// y confirma apenas la persona los da — no espera a que también elija tipo
// de palco/sillas ni mande el comprobante. Todavía no crea la reserva en
// Firestore (eso necesita también la selección del palco, que llega
// después) — solo deja el bloque "confirmado" para que inscripcionReserva.js
// lo use directo, sin volver a pedirlo ni a extraerlo de nuevo.
const { generarLoteId, loteIdValido } = require("./loteId");
const { extraerCliente } = require("./organizarDatosReserva");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarDocumento, validarTelefono, validarCorreo } = require("./validaciones");

const COLECCION_BORRADORES = "reservaBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_CLIENTE = [
  { campo: "nombreCompleto", validador: validarNombre, etiqueta: "nombre completo" },
  { campo: "cedula", validador: validarDocumento, etiqueta: "cédula" },
  { campo: "telefono", validador: validarTelefono, etiqueta: "teléfono" },
  { campo: "correo", validador: validarCorreo, etiqueta: "correo electrónico" },
];

async function registrarReservaCliente(datos = {}) {
  const { loteId, datosClienteTexto = "" } = datos;

  if (!datosClienteTexto) {
    const error = new Error("Falta el campo obligatorio: datosClienteTexto.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente");
  const nuevo = await extraerCliente(datosClienteTexto, anterior);
  const res = resolverBloque(SPEC_CLIENTE, nuevo, anterior);

  if (!res.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente", res.paraGuardar);
    return {
      ok: B(false),
      loteId: loteIdFinal,
      mensajeErrorCliente: `Todavía falta: ${res.problemas.join(", ")}.`,
    };
  }

  // Queda "confirmado" en una sección aparte de la de reintentos, para que
  // inscripcionReserva.js lo lea directo cuando llegue la selección del
  // palco, sin tener que volver a pedir ni a extraer estos datos.
  await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "clienteConfirmado", res.valores);
  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente");

  return {
    ok: B(true),
    loteId: loteIdFinal,
    mensajeErrorCliente: "",
  };
}

module.exports = { registrarReservaCliente };
