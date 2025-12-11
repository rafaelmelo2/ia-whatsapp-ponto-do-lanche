import fs from "fs";
import path from "path";
import winston from "winston";

const logDir = "logs";

// Garante que a pasta de logs existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Logger global (mantido para compatibilidade)
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, clientId, ...meta }) => {
      const clientTag = clientId ? `[${clientId}]` : "";
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
      return `[${timestamp}] ${clientTag} ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, clientId, ...meta }) => {
          const clientTag = clientId ? `[${clientId}]` : "";
          const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
          return `[${timestamp}] ${clientTag} ${level.toUpperCase()}: ${message}${metaStr}`;
        })
      )
    }),
    new winston.transports.File({ filename: "logs/app.log" })
  ]
});

// Factory para criar logger específico de cliente
export function createClientLogger(clientId: string): winston.Logger {
  const logFile = path.join(logDir, `${clientId}.log`);

  return winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
        return `[${timestamp}] [${clientId}] ${level.toUpperCase()}: ${message}${metaStr}`;
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
            return `[${timestamp}] [${clientId}] ${level.toUpperCase()}: ${message}${metaStr}`;
          })
        )
      }),
      new winston.transports.File({ filename: logFile }),
      new winston.transports.File({ filename: "logs/app.log" }) // Log global também
    ]
  });
}
