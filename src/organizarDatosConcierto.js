// Extracción de datos propios del concierto — la categoría ya llega bastante
// limpia porque Lucid la pregunta como opción cerrada, así que se resuelve
// con una simple normalización de texto, sin gastar una llamada a Claude.
// Los datos del cliente y el número de palco reutilizan las funciones ya
// hechas para la feria (organizarDatosReserva.js), que son genéricas y no
// dependen de nada específico de ese evento.
function normalizar(texto) {
  return (texto || "").toString().trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const CATEGORIAS_VALIDAS = ["patrocinadores", "diamante", "oro", "plata"];

function extraerCategoria(categoriaTexto) {
  const t = normalizar(categoriaTexto);
  if (t.includes("patrocinador")) return "patrocinadores";
  if (t.includes("diamante")) return "diamante";
  if (t.includes("oro")) return "oro";
  if (t.includes("plata")) return "plata";
  return "";
}

module.exports = { extraerCategoria, CATEGORIAS_VALIDAS };
