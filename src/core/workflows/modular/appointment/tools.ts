import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { WorkflowTools } from "../../base/workflowTools.js";
import { AppointmentRepository } from "./repository.js";
import { Appointment } from "./types.js";

/**
 * Schema para a ferramenta de agendar
 */
const ScheduleAppointmentSchema = z.object({
  services: z.array(
    z.object({
      name: z.string().describe("Nome do serviço a ser agendado"),
      observation: z.string().optional().describe("Observações sobre o serviço")
    })
  ),
  dateTime: z.string().describe("Data e hora do agendamento (formato: YYYY-MM-DD HH:mm)"),
  customerName: z.string().optional().nullable().describe("Nome do cliente (se informado)"),
  observation: z.string().optional().nullable().describe("Observações gerais do agendamento")
});

/**
 * Ferramentas disponíveis para o workflow de agendamento
 */
export class AppointmentTools extends WorkflowTools {
  getTools(): DynamicStructuredTool[] {
    return [this.createScheduleAppointmentTool()];
  }

  /**
   * Ferramenta principal: Agenda um serviço
   * O agente deve usar esta ferramenta quando o cliente confirmar o agendamento
   */
  private createScheduleAppointmentTool(): DynamicStructuredTool {
    return this.createTool(
      "schedule_appointment",
      `Agenda um serviço para o cliente. Use esta ferramenta quando o cliente confirmar explicitamente o agendamento (ex: "pode marcar", "confirmo o horário").
      Esta ferramenta salva o agendamento e envia notificações.`,
      ScheduleAppointmentSchema,
      async (input: z.infer<typeof ScheduleAppointmentSchema>) => {
        try {
          const { clientId, phone, logger } = this.context;

          const newAppointment: Appointment = {
            id: Date.now().toString(),
            customerPhone: phone,
            customerName: input.customerName || undefined,
            services: input.services,
            dateTime: input.dateTime,
            observation: input.observation || undefined,
            status: "pending",
            createdAt: new Date().toISOString()
          };

          const repo = new AppointmentRepository(clientId);
          await repo.save(newAppointment);

          // Envia notificação
          await this.sendNotification(newAppointment);

          return `✅ Agendamento confirmado! ID: ${newAppointment.id}, Data/Hora: ${newAppointment.dateTime}`;
        } catch (error) {
          this.context.logger.error("[AppointmentTools] Erro ao agendar", error);
          return `❌ Erro ao agendar: ${error instanceof Error ? error.message : "Erro desconhecido"}`;
        }
      }
    );
  }

  /**
   * Envia notificação para grupo
   */
  private async sendNotification(appointment: Appointment): Promise<void> {
    const envVarName = `${this.context.clientId.toUpperCase().replace(/-/g, "_")}_NOTIFICATION_GROUP_ID`;
    const notificationGroupId = process.env[envVarName];

    if (!notificationGroupId) {
      this.context.logger.warn(`${envVarName} não configurado na env, notificação de grupo pulada.`);
      return;
    }

    const message = `📅 *NOVO AGENDAMENTO* 📅

👤 Cliente: ${appointment.customerName || appointment.customerPhone.split("@")[0]}
📞 Fone: ${appointment.customerPhone.split("@")[0]}
⏰ Data/Hora: ${appointment.dateTime}

✂️ *Serviços:*
${appointment.services.map((s) => `- ${s.name} ${s.observation ? `(${s.observation})` : ""}`).join("\n")}

📝 Obs: ${appointment.observation || "-"}`;

    try {
      await this.context.whatsapp.sendText(notificationGroupId, message);
      this.context.logger.info(`Notificação de agendamento enviada para o grupo ${notificationGroupId}`);
    } catch (error) {
      this.context.logger.error(`Erro ao enviar notificação para o grupo ${notificationGroupId}`, error);
    }
  }
}

