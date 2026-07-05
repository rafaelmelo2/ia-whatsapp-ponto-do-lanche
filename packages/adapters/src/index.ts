// Barrel de @sirvase/adapters — implementações das ports do core.
export { LLMModel } from "./llm/openrouter/legacyChutesModel.js";
export {
  EvolutionApiProvider,
  extractInstanceName,
  parseEvolutionWebhook
} from "./whatsapp/evolution/index.js";
export {
  CloudApiProvider,
  extractPhoneNumberId,
  parseCloudApiWebhook,
  verifyMetaSignature
} from "./whatsapp/cloud-api/index.js";

// Menu (porta MenuSource)
export { ExternalApiMenuSource } from "./menu/external-api/index.js";

// Mocks — um por porta (Regra de Ouro 2: pipeline roda ponta a ponta sem rede)
export { MockWhatsAppProvider } from "./whatsapp/mock/index.js";
export type { ReadReceipt, SentText } from "./whatsapp/mock/index.js";
export { MockLlmProvider } from "./llm/mock/index.js";
export type { RecordedLlmCall } from "./llm/mock/index.js";
export { MockPaymentProvider } from "./payment/mock/index.js";
export { MockMenuSource, MOCK_MENU_ITEMS } from "./menu/mock/index.js";
export {
  InMemoryOrderRepository,
  InMemorySessionRepository,
  InMemoryTenantRepository
} from "./repositories/in-memory/index.js";
