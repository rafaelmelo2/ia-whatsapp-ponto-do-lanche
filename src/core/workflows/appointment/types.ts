export interface AppointmentService {
    name: string;
    observation?: string;
}

export interface Appointment {
    id: string;
    customerPhone: string;
    customerName?: string;
    services: AppointmentService[];
    dateTime: string; // ISO 8601 ou formato legível
    observation?: string;
    status: "pending" | "confirmed" | "cancelled" | "completed";
    createdAt: string;
}

export interface LLMAppointmentExtraction {
    services: AppointmentService[];
    dateTime: string;
    customerName?: string;
    observation?: string;
}

