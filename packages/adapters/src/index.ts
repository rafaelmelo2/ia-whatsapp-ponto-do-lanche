// Barrel de @sirvase/adapters — implementações das ports do core.
// ATENÇÃO: adapters legados (Baileys/Chutes) são referência da migração; serão
// substituídos por CloudApiProvider (Épico 4) e OpenRouter (Épico 5). Mantidos
// aqui para reaproveitamento, não exportados como API estável ainda.

export { BaileysProvider } from "./whatsapp/baileys-legacy/index.js";
export { LLMModel } from "./llm/openrouter/legacyChutesModel.js";
