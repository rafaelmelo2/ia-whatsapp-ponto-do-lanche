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
