import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { AppConfig } from "../../config/schema.js";
import { logger } from "../../utils/logger.js";

/**
 * Agente Langchain que usa ferramentas (tools) para processar mensagens
 * Usa function calling nativo do OpenAI/CHUTES.AI para chamar ferramentas automaticamente
 */
export class WorkflowAgent {
  private model: ChatOpenAI;
  private tools: DynamicStructuredTool[];
  private systemPrompt: string;

  constructor(config: AppConfig, model: ChatOpenAI, tools: DynamicStructuredTool[], systemPrompt: string) {
    // O modelo já vem configurado do LangchainModel com CHUTES.AI
    // Vamos usar bindTools para habilitar function calling
    this.model = model;
    this.tools = tools;
    this.systemPrompt = systemPrompt;

    // Diagnóstico: avisa sobre modelos conhecidos por serem lentos
    const modelName = process.env.LLM_MODEL_OVERRIDE || config.llm.model;
    if (modelName.includes("R1") || modelName.includes("r1")) {
      logger.warn(
        `[WorkflowAgent] Modelo R1 detectado (${modelName}) - modelos de raciocínio podem ser mais lentos. Considere usar V3.2 ou V3 para respostas mais rápidas.`
      );
    }

    // Diagnóstico: tamanho do system prompt
    const systemPromptSize = systemPrompt.length;
    const systemPromptTokens = Math.ceil(systemPromptSize / 4);
    if (systemPromptTokens > 5000) {
      logger.warn(`[WorkflowAgent] System prompt muito grande: ~${systemPromptTokens} tokens. Isso pode causar lentidão.`);
    }
  }

  /**
   * Executa o agente com uma mensagem do usuário
   * Usa function calling nativo para chamar ferramentas automaticamente
   */
  async invoke(input: string, history?: Array<{ role: string; content: string }>): Promise<{ content: string; thought?: string }> {
    try {
      // Constrói mensagens
      // Limita o histórico para evitar prompts muito grandes (mantém últimas 10 mensagens)
      const limitedHistory = history && history.length > 10 ? history.slice(-10) : history || [];

      if (history && history.length > 10) {
        logger.info(`[WorkflowAgent] Histórico limitado de ${history.length} para 10 mensagens para evitar prompt muito grande`);
      }

      const messages: BaseMessage[] = [
        new SystemMessage(this.systemPrompt),
        ...limitedHistory.map((h) => {
          if (h.role === "user") return new HumanMessage(h.content);
          if (h.role === "assistant") return new AIMessage(h.content);
          return new SystemMessage(h.content);
        }),
        new HumanMessage(input)
      ];

      // Usa bindTools para habilitar function calling
      // IMPORTANTE: O bindTools pode criar uma nova instância do cliente OpenAI
      // Precisamos garantir que o modelo original (com CHUTES.AI) seja usado
      // Vamos usar o modelo diretamente e passar as ferramentas no invoke

      // Primeiro, garante que o modelo tem as configurações corretas
      const apiKey = process.env.CHUTES_AI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("CHUTES_AI_API_KEY ou OPENAI_API_KEY não definida na variável de ambiente!");
      }

      // Garante que OPENAI_API_KEY está definida para compatibilidade com bindTools
      if (!process.env.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = apiKey;
      }

      const baseURL = "https://llm.chutes.ai/v1";

      // Verifica se o modelo tem o cliente configurado corretamente
      const modelClient = (this.model as any).client;
      if (modelClient) {
        if (!modelClient.baseURL || modelClient.baseURL !== baseURL) {
          modelClient.baseURL = baseURL;
        }
        if (!modelClient.apiKey || modelClient.apiKey !== apiKey) {
          modelClient.apiKey = apiKey;
        }
      }

      // Usa bindTools - agora o modelo deve ter as configurações corretas
      const modelWithTools = this.model.bindTools(this.tools);

      // Tenta garantir que o modelo bindado também tenha as configurações
      // O bindTools pode criar um wrapper, então precisamos verificar
      try {
        const boundModel = modelWithTools as any;
        // Tenta acessar o modelo interno do wrapper
        let innerModel = boundModel;
        if (boundModel.lc_kwargs?.model) {
          innerModel = boundModel.lc_kwargs.model;
        }
        // Se o modelo interno tem cliente, garante as configurações
        if (innerModel && innerModel.client) {
          const client = innerModel.client;
          if (!client.baseURL || client.baseURL !== baseURL) {
            client.baseURL = baseURL;
          }
          if (!client.apiKey || client.apiKey !== apiKey) {
            client.apiKey = apiKey;
          }
        }
      } catch (e) {
        // Se não conseguir, continua - o modelo original já está configurado
        logger.debug("[WorkflowAgent] Não foi possível verificar modelo bindado, usando original");
      }

      // Chama o modelo - ele pode retornar tool calls automaticamente
      const firstCallStart = Date.now();
      let response = await modelWithTools.invoke(messages);
      const firstCallTime = Date.now() - firstCallStart;

      let finalResponse = (response.content as string) || "";
      let thought: string | undefined;

      // Extrai o bloco de pensamento se existir na resposta inicial
      // O modelo pode usar diferentes formatos: </think>...</think>, <think>...</think>, etc.
      const thinkMatch =
        finalResponse.match(/<\/redacted_reasoning>([\s\S]*?)<\/redacted_reasoning>/i) ||
        finalResponse.match(/<think>([\s\S]*?)<\/think>/i) ||
        finalResponse.match(/<think>([\s\S]*?)<\/redacted_reasoning>/i);
      if (thinkMatch) {
        thought = thinkMatch[1].trim();
        // Remove todos os formatos possíveis de pensamento
        finalResponse = finalResponse
          .replace(/<\/redacted_reasoning>[\s\S]*?<\/redacted_reasoning>/gi, "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "")
          .trim();
        logger.info(`[WorkflowAgent] Pensamento extraído: ${thought.substring(0, 50)}...`);
      }

      // Processa tool calls se houver
      const toolCalls = (response as any).tool_calls || [];

      if (toolCalls.length > 0) {
        logger.info(`[WorkflowAgent] ${toolCalls.length} ferramenta(s) executada(s)`);

        // Executa cada ferramenta chamada
        const toolResults: Array<{ tool_call_id: string; content: string }> = [];

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name || (toolCall as any).function?.name;
          const toolArgs = toolCall.args || JSON.parse((toolCall as any).function?.arguments || "{}");
          const toolCallId = toolCall.id || (toolCall as any).id || "";

          const tool = this.tools.find((t) => t.name === toolName);

          if (tool) {
            try {
              const result = await tool.invoke(toolArgs);
              toolResults.push({
                tool_call_id: toolCallId,
                content: result
              });
            } catch (error) {
              logger.error(`[WorkflowAgent] Erro em ${toolName}:`, error);
              toolResults.push({
                tool_call_id: toolCallId,
                content: `Erro ao executar ferramenta: ${error instanceof Error ? error.message : "Erro desconhecido"}`
              });
            }
          }
        }

        // Se houver resultados de ferramentas, usa Narrativa de Sistema para continuar a conversa
        if (toolResults.length > 0) {
          const secondCallStart = Date.now();

          // Abordagem de Narrativa de Sistema: remove complexidade técnica e usa mensagem de sistema simples
          const toolResultsText = toolResults.map((r) => r.content).join("\n");

          // Constrói histórico limpo: System Prompt + Histórico + Última mensagem do usuário + Resultado da ação
          const cleanMessages: BaseMessage[] = [
            messages[0], // System Prompt
            ...messages.slice(1, -1) // Histórico anterior
          ];

          // Adiciona a última mensagem do usuário
          const lastMsg = messages[messages.length - 1];
          if (lastMsg) cleanMessages.push(lastMsg);

          // Adiciona resultado da ferramenta como instrução do sistema
          cleanMessages.push(
            new SystemMessage(
              `AÇÃO EXECUTADA PELO SISTEMA:\n${toolResultsText}\n\nINSTRUÇÃO: Continue a conversa com o usuário baseando-se no resultado acima. Se for uma foto recebida, confirme e peça os próximos dados (nome completo, autorização).`
            )
          );

          // Garante configurações do cliente
          const modelClientAlt = (this.model as any).client;
          if (modelClientAlt) {
            if (!modelClientAlt.baseURL || modelClientAlt.baseURL !== baseURL) {
              modelClientAlt.baseURL = baseURL;
            }
            if (!modelClientAlt.apiKey || modelClientAlt.apiKey !== apiKey) {
              modelClientAlt.apiKey = apiKey;
            }
          }

          try {
            const finalResponseObj = await this.model.invoke(cleanMessages);
            const secondCallTime = Date.now() - secondCallStart;

            let toolResponseContent = (finalResponseObj.content as string) || "";

            // Extrai pensamento se houver
            const finalThinkMatch =
              toolResponseContent.match(/<\/redacted_reasoning>([\s\S]*?)<\/redacted_reasoning>/i) ||
              toolResponseContent.match(/<think>([\s\S]*?)<\/think>/i) ||
              toolResponseContent.match(/<think>([\s\S]*?)<\/redacted_reasoning>/i);
            if (finalThinkMatch) {
              const newThought = finalThinkMatch[1].trim();
              thought = thought ? `${thought}\n\n[Pós-Tool]: ${newThought}` : newThought;
              toolResponseContent = toolResponseContent
                .replace(/<\/redacted_reasoning>[\s\S]*?<\/redacted_reasoning>/gi, "")
                .replace(/<think>[\s\S]*?<\/think>/gi, "")
                .replace(/<think>[\s\S]*?<\/redacted_reasoning>/gi, "")
                .trim();
            }

            finalResponse = toolResponseContent;

            const totalTime = firstCallTime + secondCallTime;
            logger.info(`[WorkflowAgent] Resposta gerada (${totalTime}ms total)`);
          } catch (error: any) {
            logger.error(`[WorkflowAgent] Erro ao processar resultado da ferramenta:`, error);
            // Fallback: resposta baseada no resultado da tool
            const toolResult = toolResults[0]?.content || "Ação processada com sucesso";
            if (toolResult.includes("Foto recebida") || toolResult.includes("✅")) {
              finalResponse =
                "Perfeito! Recebi sua foto. Agora preciso de mais algumas informações para finalizar seu pedido:\n\n• Seu nome completo\n• Você autoriza a postagem da foto para outros conteúdos da loja?";
            } else {
              finalResponse = toolResult;
            }
          }
        }
      }

      return { content: finalResponse, thought };
    } catch (error) {
      logger.error("[WorkflowAgent] Erro ao executar agente", error);
      throw error;
    }
  }

  /**
   * Retorna as ferramentas disponíveis
   */
  getTools(): DynamicStructuredTool[] {
    return this.tools;
  }
}
