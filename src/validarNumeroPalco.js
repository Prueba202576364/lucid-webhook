// Valida cuanto antes (justo después de que la persona da el número de
// palco, antes de preguntarle cuántas sillas/qué día) si ese número
// corresponde al tipo de palco que eligió y sigue disponible — así el bot
// la corrige de inmediato en vez de dejarla llenar todo el resto de la
// reserva y enterarse del error solo hasta el final, en /reserva-palco.
const { doc, getDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { extraerTipoPalco, extraerNumeroPalco } = require("./organizarDatosReserva");

const B = (v) => (v ? "true" : "false");

function listarConY(numeros) {
  if (numeros.length === 0) return "";
  if (numeros.length === 1) return `${numeros[0]}`;
  return `${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
}

async function validarNumeroPalco(datos = {}) {
  const { tipoPalcoTexto = "", numeroPalcoTexto = "" } = datos;

  if (!tipoPalcoTexto || !numeroPalcoTexto) {
    const error = new Error("Faltan campos obligatorios: tipoPalcoTexto y numeroPalcoTexto.");
    error.status = 400;
    throw error;
  }

  const tipoPalco = extraerTipoPalco(tipoPalcoTexto);
  if (!tipoPalco) {
    return { ok: B(false), mensajeError: 'No entendí qué tipo de palco eligió — responda "Palco completo" o "Por días".' };
  }

  const numero = extraerNumeroPalco(numeroPalcoTexto);
  if (!numero) {
    return { ok: B(false), mensajeError: "No entendí el número de palco — indíquelo de nuevo (ej. 14)." };
  }

  const palcosSnap = await getDoc(doc(db, "feria", "palcos"));
  const palcos = palcosSnap.exists() ? palcosSnap.data().palcos || [] : [];

  if (tipoPalco === "SILLAS") {
    const p = palcos.find((x) => x.numero === numero && x.tipo === "sillas");
    if (!p || p.bloqueado) {
      const validos = palcos
        .filter((x) => x.tipo === "sillas" && !x.bloqueado)
        .map((x) => x.numero)
        .sort((a, b) => a - b);
      return {
        ok: B(false),
        mensajeError: `El palco #${numero} no existe como palco de sillas o no está disponible. Los números válidos son: ${listarConY(validos)}.`,
      };
    }
    return { ok: B(true), mensajeError: "" };
  }

  const p = palcos.find((x) => x.numero === numero && x.tipo === "completo");
  if (!p || p.estado !== "disponible" || p.bloqueado) {
    return {
      ok: B(false),
      mensajeError: `El palco #${numero} no existe como palco completo o ya no está disponible — indique otro número.`,
    };
  }
  return { ok: B(true), mensajeError: "" };
}

module.exports = { validarNumeroPalco };
