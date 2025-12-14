import { logger } from "../../utils/logger.js";
import { BlockedNumberModel, IBlockedNumber } from "../models/BlockedNumber.js";

export interface BlockedNumberInfo {
  phone: string;
  blockedAt: Date;
  blockedBy?: string;
  reason?: string;
}

export class MongoDBBlockedNumberRepository {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * Normaliza o número de telefone
   */
  private normalizePhone(phone: string): string {
    // Remove caracteres não numéricos e @s.whatsapp.net se existir
    let cleaned = phone.replace(/[^\d]/g, "");

    // Se já tiver @s.whatsapp.net, remove primeiro
    if (phone.includes("@")) {
      cleaned = phone.split("@")[0].replace(/\D/g, "");
    }

    // Se começar com 55 (Brasil), mantém
    // Se tiver 11 dígitos e não começar com 55, assume que é número local e adiciona 55
    if (cleaned.length === 11 && !cleaned.startsWith("55")) {
      cleaned = "55" + cleaned;
    }

    // Adiciona @s.whatsapp.net
    return cleaned + "@s.whatsapp.net";
  }

  /**
   * Bloqueia um número
   */
  async blockNumber(phone: string, blockedBy?: string, reason?: string): Promise<void> {
    try {
      const normalizedPhone = this.normalizePhone(phone);

      // Desbloqueia qualquer bloqueio anterior (para histórico)
      await BlockedNumberModel.updateMany(
        { clientId: this.clientId, phone: normalizedPhone, isActive: true },
        { isActive: false, unblockedAt: new Date() }
      );

      // Cria novo bloqueio
      await BlockedNumberModel.create({
        clientId: this.clientId,
        phone: normalizedPhone,
        blockedAt: new Date(),
        blockedBy,
        reason,
        isActive: true
      });

      logger.info(`[${this.clientId}] Número bloqueado: ${normalizedPhone}`);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao bloquear número ${phone}`, error);
      throw error;
    }
  }

  /**
   * Desbloqueia um número
   */
  async unblockNumber(phone: string): Promise<void> {
    try {
      const normalizedPhone = this.normalizePhone(phone);

      await BlockedNumberModel.updateMany(
        { clientId: this.clientId, phone: normalizedPhone, isActive: true },
        { isActive: false, unblockedAt: new Date() }
      );

      logger.info(`[${this.clientId}] Número desbloqueado: ${normalizedPhone}`);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao desbloquear número ${phone}`, error);
      throw error;
    }
  }

  /**
   * Verifica se um número está bloqueado
   */
  async isBlocked(phone: string): Promise<boolean> {
    try {
      const normalizedPhone = this.normalizePhone(phone);
      const count = await BlockedNumberModel.countDocuments({
        clientId: this.clientId,
        phone: normalizedPhone,
        isActive: true
      });
      return count > 0;
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao verificar se número ${phone} está bloqueado`, error);
      return false;
    }
  }

  /**
   * Retorna todos os números bloqueados ativos
   */
  async getAllBlocked(): Promise<string[]> {
    try {
      const docs = await BlockedNumberModel.find({
        clientId: this.clientId,
        isActive: true
      }).sort({ blockedAt: -1 });

      return docs.map(doc => doc.phone);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao buscar números bloqueados`, error);
      return [];
    }
  }

  /**
   * Retorna informações detalhadas de todos os números bloqueados
   */
  async getAllBlockedWithInfo(): Promise<BlockedNumberInfo[]> {
    try {
      const docs = await BlockedNumberModel.find({
        clientId: this.clientId,
        isActive: true
      }).sort({ blockedAt: -1 });

      return docs.map(doc => ({
        phone: doc.phone,
        blockedAt: doc.blockedAt,
        blockedBy: doc.blockedBy,
        reason: doc.reason
      }));
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao buscar números bloqueados com informações`, error);
      return [];
    }
  }
}

