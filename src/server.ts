import express from "express";
import { MOCK_MENU_ITEMS } from "./core/menu/menu_data.js";
import { logger } from "./core/utils/logger.js";

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.send({ status: "ok", uptime: process.uptime() });
});

// Servindo o cardápio Mock
app.get("/menu", (req, res) => {
  res.json(MOCK_MENU_ITEMS);
});

// Webhook placeholder (se mudar para Twilio/WppConnect)
app.post("/webhook", (req, res) => {
  logger.info("Webhook recebido", req.body);
  res.sendStatus(200);
});

export function startServer(port: number = 3000) {
  const server = app.listen(port, () => {
    logger.info(`HTTP Server rodando na porta ${port}`);
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
