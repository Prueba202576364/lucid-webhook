// Servidor standalone para desplegar en Render (o cualquier hosting que corra Node
// normal) — independiente de whatsapp-agent, sin nada de Kommo ni de Claude. Un único
// endpoint que Lucid Bot llama para leer disponibilidad de palcos en tiempo real.
try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}
const http = require("http");
const { obtenerDisponibilidad } = require("./src/disponibilidad");
const { registrarInscripcionCabalgata } = require("./src/inscripcionCabalgata");

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LUCID_WEBHOOK_TOKEN;

if (!TOKEN) {
  console.warn(
    "⚠️  LUCID_WEBHOOK_TOKEN no está configurado — el endpoint quedará sin protección. Configúralo antes de desplegar a producción."
  );
}

function leerCuerpoJSON(req) {
  return new Promise((resolve, reject) => {
    let cuerpo = "";
    req.on("data", (chunk) => (cuerpo += chunk));
    req.on("end", () => {
      if (!cuerpo) return resolve({});
      try {
        resolve(JSON.parse(cuerpo));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function estaAutorizado(req) {
  return !TOKEN || req.headers["x-lucid-token"] === TOKEN;
}

async function manejarDisponibilidad(req, res) {
  if (!estaAutorizado(req)) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: "no autorizado" }));
    return;
  }

  try {
    const datos = await obtenerDisponibilidad();
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(datos));
  } catch (err) {
    console.error("Error consultando disponibilidad:", err);
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: "error interno" }));
  }
}

async function manejarInscripcionCabalgata(req, res) {
  if (!estaAutorizado(req)) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: "no autorizado" }));
    return;
  }

  let datos;
  try {
    datos = await leerCuerpoJSON(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, error: "cuerpo no es JSON válido" }));
    return;
  }

  try {
    const resultado = await registrarInscripcionCabalgata(datos);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, ...resultado }));
  } catch (err) {
    console.error("Error registrando inscripción de cabalgata:", err);
    const status = err.status || 500;
    res
      .writeHead(status, { "Content-Type": "application/json" })
      .end(JSON.stringify({ ok: false, error: status === 400 ? err.message : "error interno" }));
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Lucid webhook — disponibilidad de palcos: en línea ✅");
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && req.url === "/disponibilidad") {
    manejarDisponibilidad(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/inscripcion-cabalgata") {
    manejarInscripcionCabalgata(req, res);
    return;
  }

  res.writeHead(404).end("not found");
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
