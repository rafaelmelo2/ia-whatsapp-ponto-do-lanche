import { AppConfig } from "../../config/schema.js";

export interface WorkflowHandler {
    /**
     * Retorna o trecho de prompt com as regras específicas do workflow e o formato JSON esperado.
     */
    getPromptSnippet(config: AppConfig, menuRendered?: string): string;

    /**
     * Processa a resposta do LLM, extrai dados e verifica se há uma ação a ser tomada.
     */
    processResponse(response: string, context: any): Promise<WorkflowProcessResult>;

    /**
     * Executa a ação final (ex: salvar pedido, agendar).
     */
    executeAction(data: any, context: any): Promise<any>;
}

export interface WorkflowProcessResult {
    data: any | null; // Dados extraídos (ex: Order, Appointment)
    cleanedResponse: string; // Resposta do bot limpa (sem JSON)
    actionNeeded: boolean; // Se true, chama executeAction
}

