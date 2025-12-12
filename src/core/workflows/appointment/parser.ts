import { z } from 'zod';
import { logger } from '../../../utils/logger.js';
import { LLMAppointmentExtraction } from './types.js';

const AppointmentExtractionSchema = z.object({
    services: z.array(z.object({
        name: z.string(),
        observation: z.string().nullable().optional()
    })),
    dateTime: z.string(),
    customerName: z.string().nullable().optional(),
    observation: z.string().nullable().optional()
});

export class AppointmentParser {
    extract(response: string): LLMAppointmentExtraction | null {
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
            const result = AppointmentExtractionSchema.safeParse(parsed);

            if (result.success) {
                return {
                    services: result.data.services.map(s => ({
                        name: s.name,
                        observation: s.observation || undefined
                    })),
                    dateTime: result.data.dateTime,
                    customerName: result.data.customerName || undefined,
                    observation: result.data.observation || undefined
                };
            } else {
                logger.warn("AppointmentParser: JSON inválido segundo schema", result.error);
                return null;
            }
        } catch (e) {
            logger.warn("AppointmentParser: Falha ao parsear JSON bruto", e);
            return null;
        }
    }

    cleanResponse(response: string): string {
        const startTag = "<<<JSON";
        const startIndex = response.indexOf(startTag);

        if (startIndex === -1) return response;

        // Retorna tudo antes do bloco JSON
        return response.substring(0, startIndex).trim();
    }
}

