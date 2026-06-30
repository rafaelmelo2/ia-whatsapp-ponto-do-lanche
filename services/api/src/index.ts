// Entrypoint do serviço API (HTTP). Stub do Épico 0 — implementação real nos Épicos 3-4.
// Por enquanto expõe apenas /health para validar o ingress (P0.5).
import { logger } from "@sirvase/core";

const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "api" });
    }
    return new Response("Not Found", { status: 404 });
  }
});

logger.info(`api ouvindo em http://localhost:${server.port}`);
