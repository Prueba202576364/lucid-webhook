// Disponibilidad en tiempo real de los palcos del concierto — lee del
// proyecto Firebase "concierto-tenjo-2026" (vía firebaseAdminConcierto.js),
// completamente separado del de la feria. A diferencia de la feria, aquí
// cada palco se identifica por categoría + número (no un número único), y
// siempre se vende completo — no hay "por días" ni "por sillas". Entradas
// Generales queda fuera de este alcance por ahora.
const { dbConcierto } = require("./firebaseAdminConcierto");

const CATEGORIAS = ["patrocinadores", "diamante", "oro", "plata"];
const NOMBRE_CATEGORIA = {
  patrocinadores: "Patrocinadores",
  diamante: "Diamante",
  oro: "Oro",
  plata: "Plata",
};
const EMOJI_CATEGORIA = {
  patrocinadores: "🏆",
  diamante: "💎",
  oro: "🥇",
  plata: "🥈",
};

function formatearPesos(valor) {
  return `$${valor.toLocaleString("es-CO")}`;
}

function listarConY(numeros) {
  if (numeros.length === 0) return "";
  if (numeros.length === 1) return `${numeros[0]}`;
  return `${numeros.slice(0, -1).join(", ")} y ${numeros[numeros.length - 1]}`;
}

async function obtenerDisponibilidadConcierto() {
  const [palcosSnap, configSnap] = await Promise.all([
    dbConcierto.doc("feria/palcos").get(),
    dbConcierto.doc("feria/configuracion").get(),
  ]);

  const palcos = palcosSnap.exists ? palcosSnap.data().palcos || [] : [];
  const preciosCategorias = configSnap.exists ? configSnap.data().preciosCategorias || {} : {};

  const porCategoria = {};
  let resumenPartes = [];

  for (const categoria of CATEGORIAS) {
    const disponibles = palcos
      .filter((p) => p.categoria === categoria && p.estado === "disponible")
      .map((p) => p.numero)
      .sort((a, b) => a - b);

    const precio = preciosCategorias[categoria] ?? null;

    porCategoria[categoria] = { disponibles: disponibles.length, numeros: disponibles, precio };

    // Con 26 palcos por categoría, listar cada número disponible en el
    // mensaje sería un bloque de texto ilegible — solo se muestra la
    // cantidad y el precio; el número puntual se valida más adelante,
    // cuando la persona ya dice cuál quiere (ver validarPalcoConcierto.js).
    if (disponibles.length > 0) {
      resumenPartes.push(
        `${EMOJI_CATEGORIA[categoria]} ${NOMBRE_CATEGORIA[categoria]}: ${disponibles.length} disponibles — ${formatearPesos(precio)} c/u`
      );
    } else {
      resumenPartes.push(`${EMOJI_CATEGORIA[categoria]} ${NOMBRE_CATEGORIA[categoria]}: agotado`);
    }
  }

  return {
    ok: true,
    patrocinadoresDisponibles: porCategoria.patrocinadores.disponibles,
    patrocinadoresNumeros: listarConY(porCategoria.patrocinadores.numeros),
    patrocinadoresPrecio: porCategoria.patrocinadores.precio,
    diamanteDisponibles: porCategoria.diamante.disponibles,
    diamanteNumeros: listarConY(porCategoria.diamante.numeros),
    diamantePrecio: porCategoria.diamante.precio,
    oroDisponibles: porCategoria.oro.disponibles,
    oroNumeros: listarConY(porCategoria.oro.numeros),
    oroPrecio: porCategoria.oro.precio,
    plataDisponibles: porCategoria.plata.disponibles,
    plataNumeros: listarConY(porCategoria.plata.numeros),
    plataPrecio: porCategoria.plata.precio,
    resumenDisponibilidad: resumenPartes.join("\n"),
  };
}

module.exports = { obtenerDisponibilidadConcierto, CATEGORIAS, NOMBRE_CATEGORIA };
