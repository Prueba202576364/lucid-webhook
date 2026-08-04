// Calcula disponibilidad de palcos en tiempo real leyendo Firestore.
// Adaptado de whatsapp-agent/src/tools/consultarDisponibilidadPalcos.js (esa versión
// era una "tool" para el agente Claude+Kommo que ya no se usa) — la lógica de negocio
// en sí no dependía de Kommo para nada, así que se rescata completa acá.
const { doc, getDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { fechaColombia } = require("./fecha");

const SILLAS_POR_PALCO = 10;
const DIAS = ["viernes", "sabado", "domingo"];
const ESTADOS_QUE_NO_OCUPAN = new Set(["cancelada", "rechazada"]);

// El precio por silla no vive en Firestore: está hardcodeado en el frontend de
// palco-reservas (src/App.jsx, constante PRECIO_SILLA) en $150.000 los tres días.
// Si el organizador cambia ese valor ahí, hay que actualizarlo también acá — no
// hay una única fuente de verdad para este precio todavía.
const PRECIO_SILLA = { viernes: 150000, sabado: 150000, domingo: 150000 };

function sillasOcupadas(reservasDelDia = []) {
  return reservasDelDia
    .filter((r) => !ESTADOS_QUE_NO_OCUPAN.has(r.estado))
    .reduce((total, r) => total + (r.cantidad || 0), 0);
}

function formatearPesos(valor) {
  return `$${valor.toLocaleString("es-CO")}`;
}

// "14, 21 y 34" en vez de "14, 21, 34" — para que el texto ya quede listo
// para insertar directo en el mensaje del bot, sin que Lucid tenga que
// procesar una lista.
function listarConY(numeros) {
  if (numeros.length === 0) return "";
  if (numeros.length === 1) return `${numeros[0]}`;
  return `${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
}

// Cada palco completo puede tener su propio precio (se asigna palco por palco
// desde el botón "Precio Palco" en palco-reservas); si un palco todavía no tiene
// uno propio, cae al precio general de feria/configuracion.precioPalcoCompleto.
// Como Lucid solo puede mapear campos fijos (no listas de tamaño variable), acá
// se arma tanto la agrupación cruda (porPrecio) como un texto ya listo
// (resumenPrecios) para insertar directo en el mensaje del bot.
function agruparPorPrecio(completosDisponibles, precioPorDefecto) {
  const grupos = new Map();
  for (const p of completosDisponibles) {
    const precio = p.precio ?? precioPorDefecto;
    if (!grupos.has(precio)) grupos.set(precio, []);
    grupos.get(precio).push(p.numero);
  }

  const porPrecio = [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([precio, numeros]) => ({
      precio,
      cantidad: numeros.length,
      numeros: numeros.sort((a, b) => a - b),
    }));

  const resumenPrecios = porPrecio
    .map((g) => `${g.cantidad} palco${g.cantidad === 1 ? "" : "s"} a ${formatearPesos(g.precio)} (número${g.cantidad === 1 ? "" : "s"} ${g.numeros.join(", ")})`)
    .join(" y ");

  return { porPrecio, resumenPrecios };
}

async function obtenerDisponibilidad() {
  const [palcosSnap, configSnap] = await Promise.all([
    getDoc(doc(db, "feria", "palcos")),
    getDoc(doc(db, "feria", "configuracion")),
  ]);

  const palcos = palcosSnap.exists() ? palcosSnap.data().palcos || [] : [];
  const precioPalcoCompleto = configSnap.exists() ? configSnap.data().precioPalcoCompleto ?? null : null;

  // "estado: disponible" no basta — un palco puede seguir marcado como
  // disponible en cuanto a venta y aun así estar bloqueado manualmente por
  // un admin desde palco-reservas (candado en el mapa, campo "bloqueado"
  // independiente del estado). Si no se filtra también por eso, se ofrecen
  // palcos que en realidad no están a la venta.
  const completosDisponibles = palcos
    .filter((p) => p.tipo === "completo" && p.estado === "disponible" && !p.bloqueado)
    .sort((a, b) => a.numero - b.numero);

  const { porPrecio, resumenPrecios } = agruparPorPrecio(completosDisponibles, precioPalcoCompleto);

  const palcosSillas = palcos.filter((p) => p.tipo === "sillas" && !p.bloqueado);
  const numerosPalcosSillas = palcosSillas.map((p) => p.numero).sort((a, b) => a - b);
  const totalSillas = palcosSillas.length * SILLAS_POR_PALCO;

  const sillas = {};
  for (const dia of DIAS) {
    const ocupadas = palcosSillas.reduce((total, p) => total + sillasOcupadas(p.reservas?.[dia]), 0);
    sillas[dia] = {
      disponibles: Math.max(0, totalSillas - ocupadas),
      precio: PRECIO_SILLA[dia],
    };
  }

  return {
    ok: true,
    actualizado: fechaColombia(),
    palcosCompletos: {
      disponibles: completosDisponibles.length,
      numeros: completosDisponibles.map((p) => p.numero),
      porPrecio,
      resumenPrecios,
    },
    sillas,
    palcosSillasNumeros: numerosPalcosSillas,
    palcosSillasNumerosTexto: listarConY(numerosPalcosSillas),
  };
}

module.exports = { obtenerDisponibilidad, SILLAS_POR_PALCO, PRECIO_SILLA, DIAS, ESTADOS_QUE_NO_OCUPAN, sillasOcupadas };
