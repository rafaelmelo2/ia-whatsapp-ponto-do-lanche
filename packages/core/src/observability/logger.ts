import winston from "winston";

/**
 * Logger estruturado central do Sirvase.
 *
 * Console-only por padrão (sem efeito de I/O em disco na importação — `core` é puro).
 * P10.1 do PLANO formaliza campos estruturados (`tenant_id`, `message_id`, `from`).
 * Serviços/adapters podem anexar transports adicionais via `logger.add(...)`.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

/** Cria um logger filho com contexto fixo (ex.: `{ tenant_id, message_id }`). */
export function childLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}
