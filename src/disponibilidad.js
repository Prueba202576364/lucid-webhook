// Calcula disponibilidad de palcos en tiempo real leyendo Firestore.
// Adaptado de whatsapp-agent/src/tools/consultarDisponibilidadPalcos.js (esa versión
// era una "tool" para el agente Claude+Kommo que ya no se usa) — la lógica de negocio
// en sí no dependía de Kommo para nada, así que se rescata completa acá.
const { doc, getDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");

const SILLAS_POR_PALCO = 10;
const DIAS = ["viernes", "sabado", "domingo"];
const ESTADOS_QUE_NO_OCUPAN = new Set(["cancelada", "rechazada"]);

// El precio por silla no vive en Firestore: está hardcodeado en el frontend de
// palco-reservas (src/App.jsx, constante PRECIO_SILLA) en $120.000 los tres días.
// Si el organizador cambia ese valor ahí, hay que actualizarlo también acá — no
// hay una única fuente de verdad para este precio todavía.
const PRECIO_SILLA = { viernes: 120000, sabado: 120000, domingo: 120000 };

function sillasOcupadas(reservasDelDia = []) {
  return reservasDelDia
    .filter((r) => !ESTADOS_QUE_NO_OCUPAN.has(r.estado))
    .reduce((total, r) => total + (r.cantidad || 0), 0);
}

async function obtenerDisponibilidad() {
  const [palcosSnap, configSnap] = await Promise.all([
    getDoc(doc(db, "feria", "palcos")),
    getDoc(doc(db, "feria", "configuracion")),
  ]);

  const palcos = palcosSnap.exists() ? palcosSnap.data().palcos || [] : [];
  const precioPalcoCompleto = configSnap.exists() ? configSnap.data().precioPalcoCompleto ?? null : null;

  const completosDisponibles = palcos
    .filter((p) => p.tipo === "completo" && p.estado === "disponible")
    .map((p) => p.numero)
    .sort((a, b) => a - b);

  const sillas = {};
  for (const dia of DIAS) {
    let ocupadas = 0;
    let totalSillas = 0;
    for (const p of palcos.filter((p) => p.tipo === "sillas")) {
      totalSillas += SILLAS_POR_PALCO;
      ocupadas += sillasOcupadas(p.reservas?.[dia]);
    }
    sillas[dia] = {
      disponibles: Math.max(0, totalSillas - ocupadas),
      precio: PRECIO_SILLA[dia],
    };
  }

  return {
    ok: true,
    actualizado: new Date().toISOString(),
    palcosCompletos: {
      disponibles: completosDisponibles.length,
      numeros: completosDisponibles,
      precio: precioPalcoCompleto,
    },
    sillas,
  };
}

module.exports = { obtenerDisponibilidad };
