// Router HTTP da API. Handler puro `(req) => Response` com deps injetadas — assim o
// teste monta o router com repos apontando p/ o banco de teste, sem subir servidor.
import type { OrderRepository } from "@sirvase/core";
import { authenticate, type AuthContext } from "./auth/middleware.ts";
import { AuthError, type AuthService } from "./auth/service.ts";

export interface RouterDeps {
  auth: AuthService;
  orders: OrderRepository;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data as object, { status });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function createRouter(deps: RouterDeps) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    try {
      if (method === "GET" && pathname === "/health") {
        return json({ status: "ok", service: "api" });
      }

      // ── Público: login ──────────────────────────────────────────────────
      if (method === "POST" && pathname === "/auth/login") {
        const body = await readJson(req);
        const email = typeof body.email === "string" ? body.email : "";
        const password = typeof body.password === "string" ? body.password : "";
        const result = await deps.auth.login(email, password);
        return json(result);
      }

      // ── Protegido: signup (só admin provisiona usuários) ────────────────
      if (method === "POST" && pathname === "/auth/signup") {
        const ctx = await requireAuth(req);
        if (ctx.role !== "admin") throw new AuthError(403, "apenas admin pode criar usuários");
        const body = await readJson(req);
        const result = await deps.auth.signup({
          email: String(body.email ?? ""),
          password: String(body.password ?? ""),
          name: String(body.name ?? ""),
          tenantId: String(body.tenantId ?? ""),
          role: body.role === "admin" ? "admin" : "client"
        });
        return json(result, 201);
      }

      // ── Protegido: contexto do token ────────────────────────────────────
      if (method === "GET" && pathname === "/me") {
        const ctx = await requireAuth(req);
        return json(ctx);
      }

      // ── Protegido: pedidos DO tenant do token (isolamento por tenant) ───
      if (method === "GET" && pathname === "/orders") {
        const ctx = await requireAuth(req);
        // TODO(Épico 7): admin "vê tudo" via painel; aqui escopa sempre ao tenant do token.
        const list = await deps.orders.listByTenant(ctx.tenantId);
        return json({ orders: list });
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      if (err instanceof AuthError) return json({ error: err.message }, err.status);
      throw err;
    }
  };
}

/** Exige auth; lança AuthError 401 se ausente/inválida — capturado pelo handler. */
async function requireAuth(req: Request): Promise<AuthContext> {
  const ctx = await authenticate(req);
  if (!ctx) throw new AuthError(401, "não autenticado");
  return ctx;
}
