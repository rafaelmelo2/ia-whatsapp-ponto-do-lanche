import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { APPOINTMENT_TYPES, COMERCE_TYPES } from "../../config/modularTypes.js";
import { AppConfig } from "../../config/schema.js";
import { logger } from "../../utils/logger.js";
import { AppointmentTools } from "./appointment/tools.js";
import { AbstractWorkflow } from "../base/abstractWorkflow.js";
import { WorkflowContext } from "../base/types.js";
import { WorkflowTools } from "../base/workflowTools.js";
import { CommerceTools } from "./commerce/tools.js";

/**
 * Ferramentas modulares que combinam múltiplas ferramentas
 */
class ModularTools extends WorkflowTools {
  private config: AppConfig;
  private clientId: string;

  constructor(context: WorkflowContext, config: AppConfig, clientId: string) {
    super(context);
    this.config = config;
    this.clientId = clientId;
  }

  getTools(): DynamicStructuredTool[] {
    const tools: DynamicStructuredTool[] = [];

    // Detecção inteligente baseada em store.type
    const storeType = (this.config.store.type || "").toLowerCase();

    const isCommerceType = COMERCE_TYPES.some((t) => storeType.includes(t));
    const isAppointmentType = APPOINTMENT_TYPES.some((t) => storeType.includes(t));

    // 1. Módulo de Comércio (Catalog)
    // Ativa se: tem catalog OU o tipo sugere comércio
    if (this.config.catalog || (isCommerceType && !this.config.services)) {
      logger.info(`[ModularTools] Ativando módulo Commerce para ${this.clientId} (tipo: ${this.config.store.type})`);
      const commerceTools = new CommerceTools(this.context, this.clientId);
      tools.push(...commerceTools.getTools());
    }

    // 2. Módulo de Agendamento (Services)
    // Ativa se: tem services OU o tipo sugere agendamento OU workflow explícito
    if (this.config.services || isAppointmentType || this.config.workflow?.type === "appointment") {
      logger.info(`[ModularTools] Ativando módulo Appointment para ${this.clientId} (tipo: ${this.config.store.type})`);
      const appointmentTools = new AppointmentTools(this.context);
      tools.push(...appointmentTools.getTools());
    }

    // 3. Módulo de Custom Tools (Features explícitas)
    if (this.config.workflow?.features) {
      // Aqui poderíamos carregar features adicionais registradas
      logger.info(`[ModularTools] Features adicionais: ${this.config.workflow.features.join(", ")}`);
    }

    return tools;
  }
}

/**
 * Workflow Modular (Auto)
 * Se adapta baseado no arquivo de configuração
 */
export class ModularWorkflow extends AbstractWorkflow<any, any> {
  private clientId: string;

  constructor(config: AppConfig, model: ChatOpenAI, clientId: string) {
    super(config, model);
    this.clientId = clientId;
  }

  getTools(context: WorkflowContext): WorkflowTools {
    return new ModularTools(context, this.config, this.clientId);
  }

  getPromptSnippet(config: AppConfig, menuRendered?: string): string {
    // Não usado com tools
    return "";
  }
}
