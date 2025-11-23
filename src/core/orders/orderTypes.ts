export interface OrderItem {
  name: string;
  quantity: number;
  observation?: string;
}

export interface Order {
  id: string; // Timestamp ou UUID
  customerPhone: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "confirmed" | "delivering" | "completed" | "cancelled";
  deliveryNeeded: boolean;
  address?: string;
  paymentMethod?: string;
  createdAt: string;
}

// O que o LLM retorna (pode não ter total ou ID ainda)
export interface LLMOrderExtraction {
  items: OrderItem[];
  deliveryNeeded: boolean;
  address?: string;
  paymentMethod?: string;
}
