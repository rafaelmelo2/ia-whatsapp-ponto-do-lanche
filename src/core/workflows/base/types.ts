export interface WorkflowContext {
    clientId: string;
    phone: string;
    logger: any;
    config: any; // AppConfig
    whatsapp: any; // BaileysProvider (interface simplificada)
}
