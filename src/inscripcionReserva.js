// Reserva de un palco (completo o por sillas) hecha por un cliente a través
// del bot de WhatsApp. Se guarda exactamente en el mismo formato que usa la
// app `palcos-cliente` (colecciones `reservas` + `pagosPendientes`, ambas
// con appOrigen:'cliente') — así aparece en la pantalla "Reservas Cliente"
// que el vendedor ya usa hoy en `palco-reservas`, sin tocar nada de esas dos
// apps. Todo se manda de una sola vez (cliente + selección + comprobante),
// a diferencia de cabalgata/feria que separan el comprobante en un paso aparte.
const { collection, addDoc, doc, getDoc, serverTimestamp } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { extraerCliente, extraerTipoPalco, extraerDiasSillas, extraerNumeroPalco } = require("./organizarDatosReserva");
const { generarLoteId, loteIdValido } = require("./loteId");
const { obtenerSeccion, guardarSeccion, limpiarSeccion, resolverBloque } = require("./borradores");
const { validarNombre, validarDocumento, validarTelefono, validarCorreo } = require("./validaciones");
const { SILLAS_POR_PALCO, PRECIO_SILLA, sillasOcupadas } = require("./disponibilidad");
const { agregarFila } = require("./sheets");

const COLECCION_BORRADORES = "reservaBorradores";
const B = (v) => (v ? "true" : "false");

const TITULO_SHEET = "reservas palcos";
const NOMBRE_HOJA = "Hoja 1";
const ENCABEZADOS = [
  "Fecha inscripcion", "nombre completo", "cedula", "telefono", "correo electronico",
  "tipo de palco", "palco reservado", "cantidad sillas viernes", "cantidad sillas sabado",
  "cantidad sillas domingo", "numero de palco reservado", "valor pagado por palco",
  "valor total", "medio de pago", "comprobante de pago",
];

const SPEC_CLIENTE = [
  { campo: "nombreCompleto", validador: validarNombre, etiqueta: "nombre completo" },
  { campo: "cedula", validador: validarDocumento, etiqueta: "cédula" },
  { campo: "telefono", validador: validarTelefono, etiqueta: "teléfono" },
  { campo: "correo", validador: validarCorreo, etiqueta: "correo electrónico" },
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

async function registrarReservaPalco(datos = {}) {
  const {
    loteId,
    datosClienteTexto = "",
    tipoPalcoTexto = "",
    datosDiasTexto = "",
    numeroPalcoCompletoTexto = "",
    numeroPalcoSillasTexto = "",
    comprobantePago = "",
  } = datos;

  if (!datosClienteTexto || !tipoPalcoTexto || !comprobantePago) {
    const error = new Error("Faltan campos obligatorios: datosClienteTexto, tipoPalcoTexto y comprobantePago.");
    error.status = 400;
    throw error;
  }

  const loteIdFinal = loteIdValido(loteId) ? loteId.trim() : generarLoteId();

  const anterior = await obtenerSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente");
  const nuevo = await extraerCliente(datosClienteTexto, anterior);
  const resCliente = resolverBloque(SPEC_CLIENTE, nuevo, anterior);

  if (!resCliente.valido) {
    await guardarSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente", resCliente.paraGuardar);
    return respuestaError({
      loteId: loteIdFinal,
      errorCliente: true,
      mensajeErrorCliente: `Todavía falta: ${resCliente.problemas.join(", ")}.`,
    });
  }

  const { nombreCompleto, cedula, telefono, correo } = resCliente.valores;

  const tipoPalco = extraerTipoPalco(tipoPalcoTexto);
  if (!tipoPalco) {
    return respuestaError({
      loteId: loteIdFinal,
      errorSeleccion: true,
      mensajeErrorSeleccion: 'No entendí qué tipo de palco desea — responda "Palco completo" o "Por días".',
    });
  }

  // Lee la disponibilidad real justo antes de reservar — reduce el riesgo de
  // chocar con otra reserva, aunque no lo elimina del todo (ni palco-reservas
  // ni palcos-cliente usan transacciones tampoco, este es el mismo nivel de
  // protección que ya existe hoy en esas dos apps).
  const palcosSnap = await getDoc(doc(db, "feria", "palcos"));
  const palcos = palcosSnap.exists() ? palcosSnap.data().palcos || [] : [];

  let palcoAsignado;
  let monto;
  let cantidadTexto;
  let diasTexto;
  const cantidadPorDia = { viernes: "", sabado: "", domingo: "" };

  if (tipoPalco === "COMPLETO") {
    const configSnap = await getDoc(doc(db, "feria", "configuracion"));
    const precioPorDefecto = configSnap.exists() ? configSnap.data().precioPalcoCompleto ?? null : null;

    const numeroPedido = extraerNumeroPalco(numeroPalcoCompletoTexto);
    if (numeroPedido) {
      // La persona pidió un número específico — se respeta tal cual, no se
      // le cambia por otro sin avisar; si no sirve, se le dice por qué.
      const p = palcos.find((x) => x.numero === numeroPedido);
      if (!p || p.tipo !== "completo" || p.estado !== "disponible") {
        return respuestaError({
          loteId: loteIdFinal,
          errorSeleccion: true,
          mensajeErrorSeleccion: `El palco #${numeroPedido} no existe como palco completo o ya no está disponible — indique otro número.`,
        });
      }
      palcoAsignado = p;
    } else {
      const disponibles = palcos
        .filter((p) => p.tipo === "completo" && p.estado === "disponible")
        .sort((a, b) => a.numero - b.numero);
      if (disponibles.length === 0) {
        return respuestaError({
          loteId: loteIdFinal,
          errorSeleccion: true,
          mensajeErrorSeleccion: "Ya no quedan palcos completos disponibles.",
        });
      }
      palcoAsignado = disponibles[0];
    }
    monto = palcoAsignado.precio ?? precioPorDefecto;
    cantidadTexto = "10 sillas (completo)";
    diasTexto = "Todos los días";
  } else {
    const dias = await extraerDiasSillas(datosDiasTexto);
    if (!dias || dias.length === 0) {
      return respuestaError({
        loteId: loteIdFinal,
        errorSeleccion: true,
        mensajeErrorSeleccion: 'No entendí cuántas sillas ni para qué día — indíquelo de nuevo (ej. "2 sillas el sábado").',
      });
    }

    const numeroPedido = extraerNumeroPalco(numeroPalcoSillasTexto);
    if (numeroPedido) {
      const p = palcos.find((x) => x.numero === numeroPedido && x.tipo === "sillas");
      if (!p) {
        return respuestaError({
          loteId: loteIdFinal,
          errorSeleccion: true,
          mensajeErrorSeleccion: `El palco #${numeroPedido} no existe como palco de sillas — indique otro número.`,
        });
      }
      const cabeTodo = dias.every((d) => {
        const ocupadas = sillasOcupadas(p.reservas?.[d.dia]);
        return SILLAS_POR_PALCO - ocupadas >= d.cantidad;
      });
      if (!cabeTodo) {
        return respuestaError({
          loteId: loteIdFinal,
          errorSeleccion: true,
          mensajeErrorSeleccion: `El palco #${numeroPedido} ya no tiene cupo suficiente para lo que pidió — intente con menos sillas, otro día, u otro palco.`,
        });
      }
      palcoAsignado = p;
    } else {
      const palcosSillas = palcos.filter((p) => p.tipo === "sillas");
      let elegido = null;
      for (const p of palcosSillas) {
        const cabeTodo = dias.every((d) => {
          const ocupadas = sillasOcupadas(p.reservas?.[d.dia]);
          return SILLAS_POR_PALCO - ocupadas >= d.cantidad;
        });
        if (cabeTodo) {
          elegido = p;
          break;
        }
      }
      if (!elegido) {
        return respuestaError({
          loteId: loteIdFinal,
          errorSeleccion: true,
          mensajeErrorSeleccion: "Ya no hay suficiente cupo de sillas para lo que pidió — intente con menos sillas o cambie de día.",
        });
      }
      palcoAsignado = elegido;
    }
    monto = dias.reduce((total, d) => total + d.cantidad * (PRECIO_SILLA[d.dia] || 0), 0);
    cantidadTexto = dias.reduce((total, d) => total + d.cantidad, 0);
    diasTexto = dias.map((d) => `${d.dia}: ${d.cantidad}`).join(", ");
    for (const d of dias) cantidadPorDia[d.dia] = d.cantidad;
  }

  const fecha = new Date().toLocaleString("es-CO");

  const reservaInfo = {
    fecha,
    nombre: nombreCompleto,
    cedula,
    telefono,
    correo,
    palco: palcoAsignado.numero,
    tipoPalco: tipoPalco === "COMPLETO" ? "completo" : "sillas",
    monto,
    cantidad: cantidadTexto,
    dias: diasTexto,
    estado: "pendiente_confirmacion",
    appOrigen: "cliente",
    confirmadoPorVendedor: false,
    timestamp: serverTimestamp(),
  };

  const reservaRef = await addDoc(collection(db, "reservas"), reservaInfo);

  const pagoPendiente = {
    fechaEnvio: fecha,
    reserva: { id: reservaRef.id, ...reservaInfo },
    metodoPago: "",
    numeroComprobante: "",
    montoEsperado: monto,
    montoEnviado: monto,
    observacionesCliente: "Reserva hecha por WhatsApp (bot).",
    comprobanteUrl: comprobantePago,
    datosMetodo: null,
    reservaId: reservaRef.id,
    estado: "pendiente_verificacion",
    appOrigen: "cliente",
    timestamp: serverTimestamp(),
  };

  const pagoRef = await addDoc(collection(db, "pagosPendientes"), pagoPendiente);

  await limpiarSeccion(COLECCION_BORRADORES, loteIdFinal, "cliente");

  // Firestore ya quedó guardado (fuente de verdad). El Sheet es un espejo
  // best-effort para que lo vean sin entrar a Firebase.
  try {
    await agregarFila(
      TITULO_SHEET,
      NOMBRE_HOJA,
      ENCABEZADOS,
      [
        fecha,
        nombreCompleto,
        cedula,
        telefono,
        correo,
        tipoPalco === "COMPLETO" ? "Completo" : "Sillas",
        tipoPalco === "SILLAS" ? palcoAsignado.numero : "",
        cantidadPorDia.viernes,
        cantidadPorDia.sabado,
        cantidadPorDia.domingo,
        tipoPalco === "COMPLETO" ? palcoAsignado.numero : "",
        tipoPalco === "COMPLETO" ? monto : "",
        monto,
        "",
        comprobantePago,
      ],
      process.env.RESERVA_SHEET_ID
    );
  } catch (err) {
    console.error(`Error escribiendo la reserva ${reservaRef.id} en el Sheet (sí quedó en Firestore):`, err);
  }

  const resumen =
    `Responsable: ${nombreCompleto}\nCédula: ${cedula}\nTeléfono: ${telefono}\n` +
    `Palco: #${palcoAsignado.numero} (${reservaInfo.tipoPalco})\nDías: ${diasTexto}\nValor: $${monto.toLocaleString("es-CO")}`;

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

module.exports = { registrarReservaPalco };
