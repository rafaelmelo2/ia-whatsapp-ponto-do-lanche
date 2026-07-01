// Entrypoint do serviço API (HTTP). Rotas de auth (JWT próprio) + /health.
// Wiring real das deps: repos Postgres de @sirvase/db sobre o pool compartilhado.
import { settings } from "@sirvase/config";
import { logger } from "@sirvase/core";
import { PgOrderRepository, PgUserRepository } from "@sirvase/db";
import { AuthService } from "./auth/service.ts";
import { createRouter } from "./router.ts";

const auth = new AuthService(new PgUserRepository());
const orders = new PgOrderRepository();
const handle = createRouter({ auth, orders });

const server = Bun.serve({ port: settings.app.port, fetch: handle });

logger.info(`api ouvindo em http://localhost:${server.port}`);
