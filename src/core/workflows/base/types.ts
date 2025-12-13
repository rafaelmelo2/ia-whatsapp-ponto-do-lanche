export interface WorkflowContext {
  clientId: string;
  phone: string;
  logger: any;
  config: any; // AppConfig
  whatsapp: any; // BaileysProvider (interface simplificada)
  currentMessage?: any; // Mensagem atual (para passar rawMessage para tools)
  additionalRawMessages?: Record<string, any>; // Mapa de messageId -> rawMessage para mensagens agrupadas
}
