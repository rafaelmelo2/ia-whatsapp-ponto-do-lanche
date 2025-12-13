export interface OrderItem {
    name: string;
    quantity: number;
    observation?: string;
    requiresPhotos?: boolean; // Indica se o item precisa de fotos
}

export interface Order {
    id: string; // Timestamp ou UUID
    customerPhone: string;
    customerName?: string; // Nome do cliente (se disponível)
    items: OrderItem[];
    total: number;
    status: "pending" | "confirmed" | "delivering" | "completed" | "cancelled";
    deliveryNeeded: boolean;
    address?: string;
    paymentMethod?: string;
    createdAt: string;
    photosCollected?: boolean; // Indica se as fotos foram coletadas
}

// O que o LLM retorna (pode não ter total ou ID ainda)
export interface LLMOrderExtraction {
    items: OrderItem[];
    deliveryNeeded: boolean;
    address?: string;
    paymentMethod?: string;
}

