// Barrel público do domínio. Serviços e adapters importam SEMPRE daqui (`@sirvase/core`),
// nunca de caminhos internos. `core` não importa `adapters`, `config` nem `services`.

// Observabilidade
export * from "./observability/logger.js";

// Ports (interfaces — implementadas em @sirvase/adapters e @sirvase/db)
export * from "./ports/whatsapp.js";
export * from "./ports/repositories.js";
export * from "./ports/llm.js";
export * from "./ports/payment.js";
export * from "./ports/menu.js";
export * from "./ports/queue.js";
export * from "./ports/lock.js";

// Config de tenant (negócio, não-infra)
export * from "./config/tenantConfigSchema.js";
export * from "./config/tenantConfigFromRow.js";

// Domínio: pedidos
export * from "./orders/orderTypes.js";
export * from "./orders/orderParser.js";

// Domínio: menu
export * from "./menu/menuTypes.js";
export * from "./menu/renderMenu.js";

// LLM: construção de prompt + guard (sem SDK)
export * from "./llm/guard.js";
export * from "./llm/promptBase.js";
export * from "./llm/promptBuilder.js";

// Pipeline: orquestração de uma mensagem entrante (só portas, zero SDK)
export * from "./pipeline/processIncomingMessage.js";
export * from "./pipeline/handleIncomingJob.js";
