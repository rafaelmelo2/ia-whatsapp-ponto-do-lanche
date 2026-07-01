// JWT HS256 mínimo com Web Crypto — sem dependência externa. Escolha deliberada
// (regra do claude.md: evitar lib nova não-trivial): sign/verify de HS256 é pequeno,
// a verificação do HMAC é constant-time (crypto.subtle.verify) e o `alg` é FIXO em
// HS256 e checado na verificação (fecha a porta p/ alg-confusion / alg:none).
import { settings } from "@sirvase/config";

export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  role: "admin" | "client";
  iat: number;
  exp: number;
}

const ALG = "HS256";
const TInMs = 1000;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

const encoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function b64urlEncodeStr(s: string): string {
  return b64urlEncode(encoder.encode(s));
}

function b64urlDecodeStr(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  return atob(b64);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(settings.security.jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Assina um JWT HS256. `sub`/`tenantId`/`role` vêm do caller; iat/exp são calculados. */
export async function signToken(
  claims: Pick<JwtPayload, "sub" | "tenantId" | "role">,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / TInMs);
  const payload: JwtPayload = { ...claims, iat: now, exp: now + ttlSeconds };

  const header = b64urlEncodeStr(JSON.stringify({ alg: ALG, typ: "JWT" }));
  const body = b64urlEncodeStr(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput)));
  return `${signingInput}.${b64urlEncode(sig)}`;
}

/** Verifica assinatura + expiração. Retorna o payload ou `null` se inválido/expirado. */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  // Rejeita qualquer alg que não seja o nosso HS256 (fecha alg-confusion / none).
  try {
    const h = JSON.parse(b64urlDecodeStr(header)) as { alg?: string };
    if (h.alg !== ALG) return null;
  } catch {
    return null;
  }

  const key = await hmacKey();
  const sigBytes = Uint8Array.from(b64urlDecodeStr(sig), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    encoder.encode(`${header}.${body}`)
  );
  if (!ok) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(b64urlDecodeStr(body)) as JwtPayload;
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / TInMs)) {
    return null;
  }
  return payload;
}
