import { z } from 'zod';
import { logger } from '../observability/logger.js';
import { LLMOrderExtraction } from './orderTypes.js';

const OrderExtractionSchema = z.object({
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    observation: z.string().nullable().optional(),
  })),
  deliveryNeeded: z.boolean().nullable().optional(),
  address: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
});

export class OrderParser {
  extract(response: string): LLMOrderExtraction | null {
    const startTag = "<<<JSON";
    const endTag = ">>>";

    const startIndex = response.indexOf(startTag);
    const endIndex = response.lastIndexOf(endTag);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      return null;
    }

    const jsonString = response.substring(startIndex + startTag.length, endIndex).trim();

    try {
      const parsed = JSON.parse(jsonString);
      const result = OrderExtractionSchema.safeParse(parsed);

      if (result.success) {
        // Remove nulls e converte para undefined se precisar, ou mantém
        return {
            items: result.data.items.map(item => ({
              ...item,
              observation: item.observation ?? undefined
            })),
            deliveryNeeded: result.data.deliveryNeeded ?? false,
            address: result.data.address || undefined,
            paymentMethod: result.data.paymentMethod || undefined
        };
      } else {
        logger.warn("OrderParser: JSON inválido segundo schema", result.error);
        return null;
      }
    } catch (e) {
      logger.warn("OrderParser: Falha ao parsear JSON bruto", e);
      return null;
    }
  }

  cleanResponse(response: string): string {
    const startTag = "<<<JSON";
    const endTag = ">>>";
    const startIndex = response.indexOf(startTag);
    
    if (startIndex === -1) return response;

    // Retorna tudo antes do bloco JSON
    // Se tiver algo DEPOIS do >>>, também removemos pois o prompt diz "e NADA MAIS"
    // mas as vezes o LLM coloca "Espero que goste!". Vamos manter só o que vem antes.
    return response.substring(0, startIndex).trim();
  }
}

