import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { WorkflowContext } from "./types.js";

/**
 * Base para criar ferramentas (tools) que o agente Langchain pode usar
 * Cada workflow pode definir suas próprias ferramentas
 */
export abstract class WorkflowTools {
  protected context: WorkflowContext;

  constructor(context: WorkflowContext) {
    this.context = context;
  }

  /**
   * Retorna todas as ferramentas disponíveis para este workflow
   */
  abstract getTools(): DynamicStructuredTool[];

  /**
   * Helper para criar uma ferramenta estruturada
   */
  protected createTool<T extends z.ZodTypeAny>(
    name: string,
    description: string,
    schema: T,
    handler: (input: z.infer<T>) => Promise<string>
  ): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name,
      description,
      schema: zodToJsonSchema(schema) as any,
      func: async (input: any) => {
        const parsed = schema.parse(input);
        return await handler(parsed);
      }
    });
  }
}
