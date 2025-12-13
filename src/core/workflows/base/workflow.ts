import { AppConfig } from "../../config/schema.js";

/**
 * Interface base para handlers de workflow
 * Mantida para compatibilidade, mas agora os workflows devem estender AbstractWorkflow
 */
export interface WorkflowHandler {
  /**
   * Retorna o trecho de prompt com as regras específicas do workflow e o formato JSON esperado.
   * @deprecated Não é mais usado quando usando ferramentas Langchain
   */
  getPromptSnippet(config: AppConfig, menuRendered?: string): string;

  /**
   * Processa a resposta do LLM, extrai dados e verifica se há uma ação a ser tomada.
   * @deprecated Não é mais usado quando usando ferramentas Langchain
   */
  processResponse(response: string, context: any): Promise<WorkflowProcessResult>;

  /**
   * Executa a ação final (ex: salvar pedido, agendar).
   * @deprecated Não é mais usado quando usando ferramentas Langchain
   */
  executeAction(data: any, context: any): Promise<any>;

  /**
   * Retorna as ferramentas (tools) disponíveis para este workflow
   */
  getTools(context: any): import("./workflowTools.js").WorkflowTools;
}

export interface WorkflowProcessResult<T = any> {
  data: T | null; // Dados extraídos (ex: Order, Appointment)
  cleanedResponse: string; // Resposta do bot limpa (sem JSON)
  actionNeeded: boolean; // Se true, chama executeAction
}
