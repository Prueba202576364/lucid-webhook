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

function listarConY(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return `${items[0]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

// Junta números consecutivos en rangos ("1 al 13, 15 al 21 y 23 al 26") en
// vez de listarlos todos sueltos — con 26 palcos por categoría, la lista
// plana es ilegible mientras que los rangos muestran de un vistazo cuáles
// faltan (los huecos entre rangos).
function compactarEnRangos(numerosOrdenados) {
  if (numerosOrdenados.length === 0) return "";
  const rangos = [];
  let inicio = numerosOrdenados[0];
  let fin = numerosOrdenados[0];
  for (let i = 1; i < numerosOrdenados.length; i++) {
    const n = numerosOrdenados[i];
    if (n === fin + 1) {
      fin = n;
      continue;
    }
    rangos.push(inicio === fin ? `${inicio}` : `${inicio} al ${fin}`);
    inicio = n;
    fin = n;
  }
  rangos.push(inicio === fin ? `${inicio}` : `${inicio} al ${fin}`);
  return listarConY(rangos);
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

    if (disponibles.length > 0) {
      resumenPartes.push(
        `${EMOJI_CATEGORIA[categoria]} ${NOMBRE_CATEGORIA[categoria]}: ${compactarEnRangos(disponibles)}`
      );
    } else {
      resumenPartes.push(`${EMOJI_CATEGORIA[categoria]} ${NOMBRE_CATEGORIA[categoria]}: agotado`);
    }
  }

  return {
    ok: true,
    patrocinadoresDisponibles: porCategoria.patrocinadores.disponibles,
    patrocinadoresNumeros: compactarEnRangos(porCategoria.patrocinadores.numeros),
    patrocinadoresPrecio: porCategoria.patrocinadores.precio,
    diamanteDisponibles: porCategoria.diamante.disponibles,
    diamanteNumeros: compactarEnRangos(porCategoria.diamante.numeros),
    diamantePrecio: porCategoria.diamante.precio,
    oroDisponibles: porCategoria.oro.disponibles,
    oroNumeros: compactarEnRangos(porCategoria.oro.numeros),
    oroPrecio: porCategoria.oro.precio,
    plataDisponibles: porCategoria.plata.disponibles,
    plataNumeros: compactarEnRangos(porCategoria.plata.numeros),
    plataPrecio: porCategoria.plata.precio,
    resumenDisponibilidad: resumenPartes.join("\n"),
  };
}

module.exports = { obtenerDisponibilidadConcierto, CATEGORIAS, NOMBRE_CATEGORIA };
