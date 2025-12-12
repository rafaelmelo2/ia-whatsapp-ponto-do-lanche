import { AppConfig } from "../../config/schema.js";
import { WorkflowContext } from "../base/types.js";
import { WorkflowHandler, WorkflowProcessResult } from "../base/workflow.js";
import { AppointmentParser } from "./parser.js";
import { AppointmentRepository } from "./repository.js";
import { Appointment, LLMAppointmentExtraction } from "./types.js";

export class AppointmentHandler implements WorkflowHandler {
    private parser: AppointmentParser;

    constructor() {
        this.parser = new AppointmentParser();
    }

    getPromptSnippet(config: AppConfig): string {
        return `
FINALIZAÇÃO E JSON:

Quando o cliente confirmar o agendamento explicitamente (ex: "pode marcar", "confirmo o horário"), você deve:

1. Enviar uma mensagem curta de confirmação para o cliente.
2. Em seguida, produzir um bloco JSON oculto, COM O SEGUINTE FORMATO EXATO e NADA MAIS dentro do bloco:

O formato do JSON deve ser ESTRITAMENTE este:
<<<JSON
{
"services": [
{ "name": "Nome do Serviço", "observation": "" }
],
"dateTime": "YYYY-MM-DD HH:mm",
"customerName": "Nome do Cliente (se informado)",
"observation": "Observações gerais"
}
>>>

REGRAS DO JSON:
- "services": Lista de serviços solicitados.
- "dateTime": Data e hora combinada (formato ISO aproximado ou legível, ex: 2023-12-25 14:00).
- "customerName": Nome do cliente se ele informou.
- "observation": Observações adicionais.
- NÃO coloque emojis, comentários ou texto fora da estrutura JSON dentro do bloco.
`;
    }

    async processResponse(response: string, context: WorkflowContext): Promise<WorkflowProcessResult> {
        const extraction = this.parser.extract(response);
        const cleaned = this.parser.cleanResponse(response);

        return {
            data: extraction,
            cleanedResponse: cleaned,
            actionNeeded: !!extraction
        };
    }

    async executeAction(data: LLMAppointmentExtraction, context: WorkflowContext): Promise<Appointment> {
        const { clientId, phone, whatsapp, logger } = context;

        const newAppointment: Appointment = {
            id: Date.now().toString(),
            customerPhone: phone,
            customerName: data.customerName,
            services: data.services,
            dateTime: data.dateTime,
            observation: data.observation,
            status: "pending",
            createdAt: new Date().toISOString()
        };

        const repo = new AppointmentRepository(clientId);
        await repo.save(newAppointment);

        // Notificação para o Grupo
        const envVarName = `${clientId.toUpperCase().replace(/-/g, "_")}_NOTIFICATION_GROUP_ID`;
        const notificationGroupId = process.env[envVarName];

        if (notificationGroupId) {
            const groupMessage = `📅 *NOVO AGENDAMENTO* 📅\n\n👤 Cliente: ${data.customerName || phone.split("@")[0]}\n📞 Fone: ${phone.split("@")[0]}\n⏰ Data/Hora: ${data.dateTime}\n\n✂️ *Serviços:*\n${data.services
                .map((s) => `- ${s.name} ${s.observation ? `(${s.observation})` : ""}`)
                .join("\n")}\n\n📝 Obs: ${data.observation || "-"}`;

            try {
                await whatsapp.sendText(notificationGroupId, groupMessage);
                logger.info(`Notificação de agendamento enviada para o grupo ${notificationGroupId}`);
            } catch (error) {
                logger.error(`Erro ao enviar notificação para o grupo ${notificationGroupId}`, error);
            }
        } else {
            logger.warn(`${envVarName} não configurado na env, notificação de grupo pulada.`);
        }

        return newAppointment;
    }
}
