import { AppConfig } from "../config/schema.js";
import { WorkflowHandler } from "./base/workflow.js";
import { ModularWorkflow } from "./modular/modularWorkflow.js";
import { LangchainModel } from "../llm/langchainModel.js";
import { ChatOpenAI } from "@langchain/openai";

/**
 * Factory genérico para criar workflows
 * Centralizado no ModularWorkflow
 */
export function getWorkflowHandler(
  config: AppConfig,
  clientId: string,
  model?: ChatOpenAI
): WorkflowHandler {
  // Se não foi passado um modelo, cria um novo
  if (!model) {
    const langchainModel = new LangchainModel(config);
    model = langchainModel.getModel();
  }

  // Sempre retorna ModularWorkflow, que decide quais tools ativar internamente
  return new ModularWorkflow(config, model, clientId);
}

/**
 * Registro de workflows disponíveis
 * Mantido para compatibilidade, mas todos usam a mesma engine agora
 */
export const AVAILABLE_WORKFLOWS = ["auto", "commerce", "appointment"] as const;

export type WorkflowType = (typeof AVAILABLE_WORKFLOWS)[number];

/**
 * Verifica se um tipo de workflow é válido
 */
export function isValidWorkflowType(type: string): type is WorkflowType {
  return AVAILABLE_WORKFLOWS.includes(type as WorkflowType);
}
