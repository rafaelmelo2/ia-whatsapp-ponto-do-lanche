// Middleware de auth: extrai e valida o Bearer JWT de uma Request.
import type { JwtPayload } from "./jwt.ts";
import { verifyToken } from "./jwt.ts";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: "admin" | "client";
}

/** Retorna o contexto autenticado ou `null` se o header estiver ausente/inválido/expirado. */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  const payload = await verifyToken(token);
  if (!payload) return null;

  return toContext(payload);
}

function toContext(p: JwtPayload): AuthContext {
  return { userId: p.sub, tenantId: p.tenantId, role: p.role };
}
