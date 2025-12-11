import express from "express";
import { logger } from "./core/utils/logger.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    clientId: (global as any).CLIENT_ID || "unknown",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Webhook placeholder (se mudar para Twilio/WppConnect)
app.post("/webhook", (req, res) => {
  logger.info("Webhook recebido", req.body);
  res.sendStatus(200);
});

export function startServer(port: number = 3000, clientId?: string) {
  // Armazena clientId globalmente para o endpoint /health
  if (clientId) {
    (global as any).CLIENT_ID = clientId;
  }

  const server = app.listen(port, () => {
    logger.info(`HTTP Server rodando na porta ${port}${clientId ? ` (cliente: ${clientId})` : ""}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      logger.warn(`Porta ${port} ocupada. Tentando ${port + 1}...`);
      startServer(port + 1);
    } else {
      logger.error("Erro no servidor HTTP:", err);
    }
  });
}
