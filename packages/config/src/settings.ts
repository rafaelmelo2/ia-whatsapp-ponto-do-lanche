// Único lugar do sistema que lê `process.env` e o YAML de config.
// Mescla secrets (env) + config não-secreta (config/app/${ENVIRONMENT}.yaml) num
// objeto `settings` tipado e congelado. EXPLODE no boot (mensagem clara + exit 1)
// se faltar obrigatório ou o YAML for inválido — fail-fast, nunca silencioso.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import yaml from "js-yaml";

// ── Schema (a): variáveis de ambiente — secrets + modo de execução ──────────
const envSchema = z.object({
  ENVIRONMENT: z.enum(["local", "staging", "prod"]).default("local"),
  INGRESS_MODE: z.enum(["loopback", "gateway", "edge"]).default("loopback"),

  APP_PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost"),

  POSTGRES_HOST: z.string().default("postgres"),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().default("sirvase"),
  POSTGRES_USER: z.string().default("sirvase"),
  POSTGRES_PASSWORD: z.string().min(1, "POSTGRES_PASSWORD é obrigatório"),

  REDIS_HOST: z.string().default("redis"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().min(1, "REDIS_PASSWORD é obrigatório"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter ao menos 32 caracteres"),
  ENCRYPTION_KEY: z.string().optional(),

  LLM_API_KEY: z.string().min(1, "LLM_API_KEY é obrigatório"),
  LLM_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),

  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v22.0"),
  ASAAS_API_KEY: z.string().optional()
});

// ── Schema (b): arquivo YAML não-secreto por ambiente ───────────────────────
const fileSchema = z.object({
  cors: z.object({
    origins: z.array(z.string()).default([])
  }),
  pools: z.object({
    postgres: z.object({ max: z.number().int().positive() }),
    redis: z.object({ max: z.number().int().positive() })
  }),
  llm: z.object({
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().positive()
  }),
  queue: z.object({
    name: z.string().min(1),
    concurrency: z.number().int().positive()
  })
});

type Env = z.infer<typeof envSchema>;
type FileConfig = z.infer<typeof fileSchema>;

/** Aborta o processo com mensagem clara — usado em qualquer falha de config no boot. */
function die(title: string, detail: string): never {
  console.error(`\n✖ [config] ${title}\n${detail}\n`);
  process.exit(1);
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("\n");
    die("Variáveis de ambiente inválidas/ausentes:", issues);
  }
  return parsed.data;
}

function loadFile(environment: Env["ENVIRONMENT"]): FileConfig {
  const dir = process.env.CONFIG_DIR ?? resolve(process.cwd(), "config/app");
  const path = resolve(dir, `${environment}.yaml`);

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return die("Arquivo de config não encontrado:", `  ${path}`);
  }

  let doc: unknown;
  try {
    doc = yaml.load(raw);
  } catch (e) {
    return die(`YAML inválido em ${path}:`, `  ${(e as Error).message}`);
  }

  const parsed = fileSchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`)
      .join("\n");
    die(`Config inválida em ${path}:`, issues);
  }
  return parsed.data;
}

function build() {
  const env = loadEnv();
  const file = loadFile(env.ENVIRONMENT);

  return Object.freeze({
    environment: env.ENVIRONMENT,
    ingressMode: env.INGRESS_MODE,

    app: Object.freeze({
      port: env.APP_PORT,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      logLevel: env.LOG_LEVEL
    }),

    postgres: Object.freeze({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      poolMax: file.pools.postgres.max
    }),

    redis: Object.freeze({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      poolMax: file.pools.redis.max
    }),

    security: Object.freeze({
      jwtSecret: env.JWT_SECRET,
      encryptionKey: env.ENCRYPTION_KEY
    }),

    llm: Object.freeze({
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_BASE_URL,
      model: file.llm.model,
      temperature: file.llm.temperature,
      maxTokens: file.llm.maxTokens
    }),

    whatsapp: Object.freeze({
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      appSecret: env.WHATSAPP_APP_SECRET,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      graphVersion: env.WHATSAPP_GRAPH_VERSION
    }),

    asaas: Object.freeze({
      apiKey: env.ASAAS_API_KEY
    }),

    cors: Object.freeze({ origins: file.cors.origins }),
    queue: Object.freeze({ name: file.queue.name, concurrency: file.queue.concurrency })
  });
}

export type Settings = ReturnType<typeof build>;

/** Config global congelada. Importe daqui; nunca leia `process.env` em outro lugar. */
export const settings: Settings = build();
