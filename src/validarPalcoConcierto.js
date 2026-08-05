// Valida cuanto antes (justo después de que la persona da la categoría y el
// número) si ese palco existe y sigue disponible — así el bot la corrige de
// inmediato en vez de dejarla llegar hasta el comprobante y enterarse del
// error solo al final. No existe el concepto de "bloqueado" aquí (a
// diferencia de la feria) — solo importa el campo "estado".
const { dbConcierto } = require("./firebaseAdminConcierto");
const { extraerCategoria } = require("./organizarDatosConcierto");
const { extraerNumeroPalco } = require("./organizarDatosReserva");

const B = (v) => (v ? "true" : "false");

async function validarPalcoConcierto(datos = {}) {
  const { categoriaTexto = "", numeroPalcoTexto = "" } = datos;

  if (!categoriaTexto) {
    const error = new Error("Falta el campo obligatorio: categoriaTexto.");
    error.status = 400;
    throw error;
  }

  const categoria = extraerCategoria(categoriaTexto);
  if (!categoria) {
    return { ok: B(false), mensajeError: "No entendí la categoría — responda Patrocinadores, Diamante, Oro o Plata." };
  }

  const numero = extraerNumeroPalco(numeroPalcoTexto);
  if (!numero) {
    return { ok: B(false), mensajeError: "No entendí el número de palco — indíquelo de nuevo (ej. 14)." };
  }

  const palcosSnap = await dbConcierto.doc("feria/palcos").get();
  const palcos = palcosSnap.exists ? palcosSnap.data().palcos || [] : [];
  const p = palcos.find((x) => x.categoria === categoria && x.numero === numero);

  if (!p || p.estado !== "disponible") {
    return {
      ok: B(false),
      mensajeError: `El palco ${categoria} #${numero} no existe o ya no está disponible — indique otro número.`,
    };
  }

  return { ok: B(true), mensajeError: "" };
}

module.exports = { validarPalcoConcierto };
