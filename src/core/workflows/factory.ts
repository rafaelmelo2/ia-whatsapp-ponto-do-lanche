import { AppConfig } from "../config/schema.js";
import { AppointmentHandler } from "./appointment/handler.js";
import { WorkflowHandler } from "./base/workflow.js";
import { CommerceHandler } from "./commerce/handler.js";

export function getWorkflowHandler(config: AppConfig): WorkflowHandler {
    const type = config.workflow?.type || "commerce";

    switch (type) {
        case "commerce":
            return new CommerceHandler();
        case "appointment":
            return new AppointmentHandler();
        default:
            // Fallback seguro
            return new CommerceHandler();
    }
}

