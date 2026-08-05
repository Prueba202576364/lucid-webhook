// Reserva de un palco del concierto hecha por un cliente vía el bot de
// WhatsApp. Se guarda en el formato que ya espera la app `concierto-reservas`
// para sus "reservas del cliente" (colecciones `reservas` + `pagosPendientes`,
// appOrigen:'cliente') — así aparece en su propia pantalla de revisión, sin
// tocar nada de esa app. Los datos del cliente ya se validaron aparte (ver
// inscripcionReservaConciertoCliente.js) — este endpoint solo se encarga de
// la categoría/número de palco y el comprobante.
const { dbConcierto } = require("./firebaseAdminConcierto");
const { FieldValue } = require("firebase-admin/firestore");
const { extraerCategoria } = require("./organizarDatosConcierto");
const { extraerNumeroPalco } = require("./organizarDatosReserva");
const { obtenerSeccion, limpiarSeccion } = require("./borradoresConcierto");
const { fechaColombia } = require("./fecha");
const { agregarFila } = require("./sheets");

const COLECCION_BORRADORES = "reservaConciertoBorradores";
const B = (v) => (v ? "true" : "false");

const TITULO_SHEET_CONCIERTO = "Reservas concierto";
const NOMBRE_HOJA_CONCIERTO = "Hoja 1";
const ENCABEZADOS_CONCIERTO = [
  "Fecha inscripcion", "nombre completo", "cedula", "telefono", "correo electronico",
  "Patrocinadores", "Diamante", "Oro", "Plata", "valor pagado por palco",
  "valor total", "medio d pago", "comprobante de pago",
];

function respuestaError({ loteId, errorCliente = false, errorSeleccion = false, mensajeErrorCliente = "", mensajeErrorSeleccion = "" }) {
  return {
    ok: B(false),
    loteId,
    errorCliente: B(errorCliente),
    errorSeleccion: B(errorSeleccion),
    mensajeErrorCliente,
    mensajeErrorSeleccion,
  };
}

async function registrarReservaConcierto(datos = {}) {
  const { loteId, categoriaTexto = "", numeroPalcoTexto = "", comprobantePago = "" } = datos;

  if (!loteId || !loteId.trim() || !categoriaTexto || !numeroPalcoTexto || !comprobantePago) {
    const error = new Error("Faltan campos obligatorios: loteId, categoriaTexto, numeroPalcoTexto y comprobantePago.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteId.trim();

  const cliente = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "clienteConfirmado");
  if (!cliente) {
    return respuestaError({
      loteId: loteIdFinal,
      errorCliente: true,
      mensajeErrorCliente: "No encontré los datos del responsable para ese loteId — primero hay que registrarlos.",
    });
  }
  const { nombreCompleto, cedula, telefono, correo } = cliente;

  const categoria = extraerCategoria(categoriaTexto);
  if (!categoria) {
    return respuestaError({
      loteId: loteIdFinal,
      errorSeleccion: true,
      mensajeErrorSeleccion: "No entendí la categoría — responda Patrocinadores, Diamante, Oro o Plata.",
    });
  }

  const numero = extraerNumeroPalco(numeroPalcoTexto);
  if (!numero) {
    return respuestaError({
      loteId: loteIdFinal,
      errorSeleccion: true,
      mensajeErrorSeleccion: "No entendí el número de palco — indíquelo de nuevo (ej. 14).",
    });
  }

  // Lee la disponibilidad real justo antes de reservar — igual que en la
  // feria, esto no es una transacción atómica (la app del concierto tampoco
  // usa transacciones), es la misma mitigación liviana de siempre.
  const palcosSnap = await dbConcierto.doc("feria/palcos").get();
  const palcos = palcosSnap.exists ? palcosSnap.data().palcos || [] : [];
  const palco = palcos.find((p) => p.categoria === categoria && p.numero === numero);

  if (!palco || palco.estado !== "disponible") {
    return respuestaError({
      loteId: loteIdFinal,
      errorSeleccion: true,
      mensajeErrorSeleccion: `El palco ${categoria} #${numero} no existe o ya no está disponible — indique otro número.`,
    });
  }

  const monto = palco.precio;
  const fecha = fechaColombia();
  const palcoIdTexto = `${categoria}-${numero}`;

  const reservaRef = dbConcierto.collection("reservas").doc();
  const reservaInfo = {
    id: reservaRef.id,
    appOrigen: "cliente",
    estado: "pendiente",
    palco: palcoIdTexto,
    palcoId: palcoIdTexto,
    categoria,
    numero,
    nombre: nombreCompleto,
    cedula,
    telefono,
    correo,
    monto,
    fecha,
    timestamp: FieldValue.serverTimestamp(),
  };
  await reservaRef.set(reservaInfo);

  const pagoPendiente = {
    appOrigen: "cliente",
    reservaId: reservaRef.id,
    estado: "pendiente_verificacion",
    fechaEnvio: fecha,
    reserva: {
      nombre: nombreCompleto,
      cedula,
      telefono,
      correo,
      palcoId: palcoIdTexto,
      categoria,
      numero,
      monto,
      descripcion: `Palco ${categoria} #${numero}`,
      tipo: "palco",
    },
    metodoPago: "",
    numeroComprobante: "",
    montoEsperado: monto,
    montoEnviado: monto,
    observaciones: "Reserva hecha por WhatsApp (bot).",
    comprobanteUrl: comprobantePago,
    datosMetodo: null,
    timestamp: FieldValue.serverTimestamp(),
  };
  const pagoRef = await dbConcierto.collection("pagosPendientes").add(pagoPendiente);

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "clienteConfirmado");

  // Firestore ya quedó guardado (fuente de verdad). El Sheet es un espejo
  // best-effort — si falla, no se pierde la reserva, solo se le avisa al
  // log para que alguien lo revise a mano. El número del palco va en la
  // columna de su propia categoría, dejando las otras tres en blanco.
  try {
    const columnasCategorias = { patrocinadores: "", diamante: "", oro: "", plata: "" };
    columnasCategorias[categoria] = numero;

    await agregarFila(
      TITULO_SHEET_CONCIERTO,
      NOMBRE_HOJA_CONCIERTO,
      ENCABEZADOS_CONCIERTO,
      [
        fecha,
        nombreCompleto,
        cedula,
        telefono,
        correo,
        columnasCategorias.patrocinadores,
        columnasCategorias.diamante,
        columnasCategorias.oro,
        columnasCategorias.plata,
        monto,
        monto,
        "",
        comprobantePago,
      ],
      process.env.CONCIERTO_SHEET_ID
    );
  } catch (err) {
    console.error(`Error escribiendo la reserva del concierto ${reservaRef.id} en el Sheet (sí quedó en Firestore):`, err);
  }

  const resumen =
    `Responsable: ${nombreCompleto}\nCédula: ${cedula}\nTeléfono: ${telefono}\n` +
    `Palco: ${categoria} #${numero}\nValor: $${monto.toLocaleString("es-CO")}`;

  return {
    ok: B(true),
    loteId: loteIdFinal,
    id: reservaRef.id,
    pagoId: pagoRef.id,
    errorCliente: B(false),
    errorSeleccion: B(false),
    mensajeErrorCliente: "",
    mensajeErrorSeleccion: "",
    resumen,
  };
}

module.exports = { registrarReservaConcierto };
