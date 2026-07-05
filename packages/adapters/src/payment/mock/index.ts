// Mock da porta PaymentProvider — gateway fake em memória, zero rede.
// parseWebhook aceita um payload canônico {type, gatewayId} (mesmo shape do
// evento de domínio), suficiente pra exercitar o fluxo de assinatura nos testes.
import type {
  CreateSubscriptionInput,
  PaymentProvider,
  PaymentWebhookEvent,
  SubscriptionResult
} from "@sirvase/core";

const EVENT_TYPES = new Set(["payment_confirmed", "payment_overdue", "subscription_cancelled"]);

export class MockPaymentProvider implements PaymentProvider {
  readonly created: CreateSubscriptionInput[] = [];

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    this.created.push(input);
    return {
      // Determinístico por tenant: reexecutar o mock não "cria" assinatura nova.
      gatewayId: `mock-sub-${input.tenantId}`,
      status: input.trialEndsAt && input.trialEndsAt > new Date() ? "pending" : "active",
      paymentUrl: `https://mock.pagamento.local/sub/${input.tenantId}`
    };
  }

  parseWebhook(payload: unknown): PaymentWebhookEvent | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Partial<PaymentWebhookEvent>;
    if (typeof p.gatewayId !== "string" || typeof p.type !== "string" || !EVENT_TYPES.has(p.type)) {
      return null;
    }
    return { type: p.type, gatewayId: p.gatewayId, occurredAt: p.occurredAt };
  }
}
