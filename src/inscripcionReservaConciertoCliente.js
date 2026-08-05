// Primer bloque de la reserva de palco del concierto: los datos del
// responsable. Se valida y confirma apenas la persona los da — igual que en
// la feria (inscripcionReservaCliente.js) — pero guardado en su propia
// colección de borradores, en el proyecto Firebase del concierto, para que
// nunca se mezcle con los borradores de la feria/cabalgata.
const { generarLoteId, loteIdValido } = require("./loteId");
const { extraerCliente } = require("./organizarDatosReserva");
const { resolverBloque } = require("./borradores");
const { obtenerSeccion, guardarSeccion, limpiarSeccion } = require("./borradoresConcierto");
const { validarNombre, validarDocumento, validarTelefono, validarCorreo } = require("./validaciones");

const COLECCION_BORRADORES = "reservaConciertoBorradores";
const B = (v) => (v ? "true" : "false");

const SPEC_CLIENTE = [
  { campo: "nombreCompleto", validador: validarNombre, etiqueta: "nombre completo" },
  { campo: "cedula", validador: validarDocumento, etiqueta: "cédula" },
  { campo: "telefono", validador: validarTelefono, etiqueta: "teléfono" },
  { campo: "correo", validador: validarCorreo, etiqueta: "correo electrónico" },
];

async function registrarReservaConciertoCliente(datos = {}) {
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

  await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "clienteConfirmado", res.valores);
  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente");

  return {
    ok: B(true),
    loteId: loteIdFinal,
    mensajeErrorCliente: "",
  };
}

module.exports = { registrarReservaConciertoCliente };
