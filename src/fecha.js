// Fecha/hora en formato colombiano (America/Bogota), consistente en toda la
// app — el servidor corre en Render, que usa UTC por defecto, así que sin
// especificar la zona horaria explícitamente la hora queda desfasada.
function fechaColombia() {
  return new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    hour12: false,
  });
}

module.exports = { fechaColombia };
