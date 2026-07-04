#!/usr/bin/env bun
// Seed idempotente do tenant inicial (Ponto do Lanche) + usuário admin.
// Reexecutável: ON CONFLICT DO NOTHING não sobrescreve dados existentes.
// Uso: bun run db/seed.ts   (ou `bun run db:seed`)
import { sql } from "../packages/db/src/client.ts";

// UUID fixo p/ o tenant seed — torna o seed determinístico/idempotente e permite
// referenciá-lo em outros seeds/fixtures sem consultar o banco.
const PONTO_DO_LANCHE_ID = "a278e80f-399d-47d9-b4db-9b3f6798d147";

// Config de negócio do Ponto do Lanche (evoluído de _legacy/ponto-do-lanche.config.yaml).
const config = {
  store: { id: "ponto-do-lanche", name: "Ponto do Lanche", phone: "+5511999999999" },
  hours: {
    open: "19:00",
    close: "22:30",
    days_open: [
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
      "Domingo"
    ]
  },
  payments: { methods: ["Pix", "Cartão de Crédito/Débito", "Dinheiro"] },
  delivery: {
    enabled: true,
    fee_by_neighborhood: true,
    eta_min: 20,
    eta_max: 50,
    surcharge_per_sandwich: 0.5,
    minimum_fee: 5
  },
  menu: { api_url: "http://129.153.92.154/api/menu/items", currency: "BRL" },
  upsell: {
    default_suggestions: ["creme de morango", "refrigerante", "molho de alho"],
    best_sellers_tag: "mais_vendido"
  },
  tone: {
    greeting: "Oi! 😄 Seja bem-vindo(a) à *Ponto do Lanche*!",
    emojis: "moderado",
    style: "simpático, direto, vendedor"
  },
  llm: { model: "deepseek-ai/DeepSeek-R1-0528", temperature: 0.5, max_tokens: 10000 }
};

// Senha padrão de dev do admin. TROCAR em qualquer ambiente real.
const ADMIN_EMAIL = "admin@pontodolanche.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

async function seed() {
  await sql.unsafe(
    `INSERT INTO tenants (id, store_name, store_type, catalog_api_url, pix_key,
        status, plan, cardapio_source, active, config, wa_number, wa_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9::jsonb, $10, $11)
     ON CONFLICT (id) DO UPDATE SET wa_number = EXCLUDED.wa_number, wa_provider = EXCLUDED.wa_provider`,
    [
      PONTO_DO_LANCHE_ID,
      "Ponto do Lanche",
      "hamburgueria",
      "http://129.153.92.154/api/menu/items",
      "pix@pontodolanche.com",
      "trial",
      "mensalidade_fixa",
      "external",
      JSON.stringify(config),
      "5511999999999", // placeholder — troca quando o chip de teste real for provisionado
      "evolution"
    ]
  );

  const passwordHash = await Bun.password.hash(ADMIN_PASSWORD, "argon2id");
  await sql.unsafe(
    `INSERT INTO users (email, password_hash, name, role, tenant_id)
     VALUES ($1, $2, $3, 'admin', $4)
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN_EMAIL, passwordHash, "Admin Ponto do Lanche", PONTO_DO_LANCHE_ID]
  );

  console.log(`✓ seed ok — tenant "Ponto do Lanche" + admin ${ADMIN_EMAIL}`);
}

try {
  await seed();
} finally {
  await sql.close();
}
