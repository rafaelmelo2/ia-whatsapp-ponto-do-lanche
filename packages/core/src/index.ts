// Barrel público do domínio. Serviços e adapters importam SEMPRE daqui (`@sirvase/core`),
// nunca de caminhos internos. `core` não importa `adapters`, `config` nem `services`.

// Observabilidade
export * from "./observability/logger.js";

// Ports (interfaces — implementadas em @sirvase/adapters e @sirvase/db)
export * from "./ports/whatsapp.js";

// Config de tenant (negócio, não-infra)
export * from "./config/tenantConfigSchema.js";

// Domínio: pedidos
export * from "./orders/orderTypes.js";
export * from "./orders/orderParser.js";

// Domínio: menu
export * from "./menu/menuTypes.js";
export * from "./menu/menuService.js";

// LLM: construção de prompt + guard (sem SDK)
export * from "./llm/guard.js";
export * from "./llm/promptBuilder.js";
