import { ChatOpenAI } from "@langchain/openai";
import { AppConfig } from "../../config/schema.js";
import { WorkflowContext } from "../base/types.js";
import { WorkflowProcessResult } from "./workflow.js";
import { WorkflowTools } from "./workflowTools.js";

/**
 * Classe base abstrata para todos os workflows
 * Fornece estrutura genérica e extensível para adicionar novos workflows facilmente
 * Agora suporta ferramentas Langchain que o agente pode usar
 */
export abstract class AbstractWorkflow<TExtraction = any, TEntity = any> {
  protected config: AppConfig;
  protected model: ChatOpenAI;

  constructor(config: AppConfig, model: ChatOpenAI) {
    this.config = config;
    this.model = model;
  }

  /**
   * Retorna as ferramentas (tools) disponíveis para este workflow
   * Cada workflow deve implementar suas próprias ferramentas
   */
  abstract getTools(context: WorkflowContext): WorkflowTools;

  /**
   * Retorna o trecho de prompt com as regras específicas do workflow
   * @deprecated Não é mais usado quando usando ferramentas Langchain
   */
  getPromptSnippet(config: AppConfig, menuRendered?: string): string {
    return ""; // Não precisa mais de instruções JSON
  }

  /**
   * Processa a resposta do LLM e extrai dados estruturados
   * @deprecated Não é mais usado quando usando ferramentas Langchain
   */
  async processResponse(response: string, context: WorkflowContext): Promise<WorkflowProcessResult<TExtraction>> {
    return {
      data: null,
      cleanedResponse: response,
      actionNeeded: false
    };
  }

  /**
   * Executa a ação final (ex: salvar pedido, agendar)
   * @deprecated Não é mais usado quando usando ferramentas Langchain - use as ferramentas diretamente
   */
  async executeAction(data: TExtraction, context: WorkflowContext): Promise<TEntity> {
    throw new Error("executeAction não deve ser usado com ferramentas Langchain. Use as ferramentas diretamente.");
  }
}
