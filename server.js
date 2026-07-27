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

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.LUCID_WEBHOOK_TOKEN;

if (!TOKEN) {
  console.warn(
    "⚠️  LUCID_WEBHOOK_TOKEN no está configurado — el endpoint quedará sin protección. Configúralo antes de desplegar a producción."
  );
}

async function manejarDisponibilidad(req, res) {
  if (TOKEN && req.headers["x-lucid-token"] !== TOKEN) {
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

  res.writeHead(404).end("not found");
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
