function generarLoteId() {
  return "LOTE-" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// Si en Lucid el campo personalizado del loteId todavía no existe o no se
// llenó, la variable "{{...}}" puede llegar sin resolver, tal cual, como
// texto — hay que tratar eso como si no hubiera llegado nada.
function loteIdValido(loteId) {
  return typeof loteId === "string" && loteId.trim() && !loteId.includes("{{");
}

module.exports = { generarLoteId, loteIdValido };
