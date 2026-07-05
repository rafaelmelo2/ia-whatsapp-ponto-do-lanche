// Porta de pagamento — assinatura recorrente (mensalidade fixa, trial 14d).
// Implementação real (Asaas) e mock em @sirvase/adapters. Segue o mesmo padrão
// webhook+REST da porta de WhatsApp: `parseWebhook` traduz o payload cru do
// gateway num evento de domínio (ou null se não interessa).

export interface SubscriptionCustomer {
  name: string;
  email?: string;
  phone?: string;
  /** CPF/CNPJ — o Asaas exige pra criar cobrança. */
  document?: string;
}

export interface CreateSubscriptionInput {
  tenantId: string;
  plan: string;
  /** Centavos, nunca float de reais. */
  amountCents: number;
  customer: SubscriptionCustomer;
  trialEndsAt?: Date;
}

export type SubscriptionStatus = "pending" | "active" | "past_due" | "cancelled";

export interface SubscriptionResult {
  /** ID da assinatura no gateway — vai pra `subscriptions.gateway_id`. */
  gatewayId: string;
  status: SubscriptionStatus;
  /** Link de pagamento (Pix/boleto) pra mostrar no painel. */
  paymentUrl?: string;
  nextDueDate?: Date;
}

export type PaymentEventType =
  | "payment_confirmed"
  | "payment_overdue"
  | "subscription_cancelled";

export interface PaymentWebhookEvent {
  type: PaymentEventType;
  gatewayId: string;
  occurredAt?: Date;
}

export interface PaymentProvider {
  createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult>;
  /** Traduz o payload cru do webhook do gateway. `null` se não é evento que nos interessa. */
  parseWebhook(payload: unknown): PaymentWebhookEvent | null;
}
