// Serviço de auth: signup/login sobre UserRepository. Hash de senha com argon2id
// (Bun.password — mesmo algoritmo do seed). Emite JWT via ./jwt. Nunca devolve o
// password_hash para fora.
import type { UserRepository, UserRow } from "@sirvase/core";
import { signToken } from "./jwt.ts";

/** Erro de auth com status HTTP — o router traduz em Response. */
export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthResult {
  user: UserRow;
  token: string;
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  tenantId: string;
  role?: UserRow["role"];
}

export class AuthService {
  constructor(private readonly users: UserRepository) {}

  async signup(input: SignupInput): Promise<AuthResult> {
    if (!input.email || !input.password || !input.name || !input.tenantId) {
      throw new AuthError(400, "email, password, name e tenantId são obrigatórios");
    }
    if (input.password.length < 8) {
      throw new AuthError(400, "senha deve ter ao menos 8 caracteres");
    }
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new AuthError(409, "email já cadastrado");

    const passwordHash = await Bun.password.hash(input.password, "argon2id");
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role ?? "client",
      tenantId: input.tenantId
    });
    const token = await this.issue(user);
    return { user, token };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const record = await this.users.findByEmail(email);
    // Verifica o hash mesmo com user inexistente seria ideal p/ timing, mas
    // argon2 sem hash não roda; a mensagem genérica já não distingue os casos.
    if (!record) throw new AuthError(401, "credenciais inválidas");

    const ok = await Bun.password.verify(password, record.passwordHash);
    if (!ok) throw new AuthError(401, "credenciais inválidas");

    const { passwordHash: _omit, ...user } = record;
    const token = await this.issue(user);
    return { user, token };
  }

  private issue(user: UserRow): Promise<string> {
    return signToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
  }
}
