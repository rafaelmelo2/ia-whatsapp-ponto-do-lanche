import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AppConfig } from "../config/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PromptBuilder {
  private template: string;

  constructor() {
    const templatePath = path.join(__dirname, "promptBase.md");
    this.template = fs.readFileSync(templatePath, "utf8");
  }

  build(config: AppConfig, menuRendered: string, jsonInstructions: string): string {
    let prompt = this.template;

    // Workflow JSON Instructions
    prompt = prompt.replace("{{workflow.json_instructions}}", jsonInstructions);

    // Teste
    prompt = prompt.replace("{{isTest}}", config.test?.enabled ? config.test.message : "");

    // Data e hora atual (usando locale e timezone da config)
    const timezone = config.locale?.timezone || "America/Sao_Paulo";
    const language = config.locale?.language || "pt-BR";
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString(language, {
      weekday: "long",
      timeZone: timezone
    });
    const dateTimeFormatted = now.toLocaleString(language, {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: timezone
    });
    prompt = prompt.replace("{{datetime.dayOfWeek}}", dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1));
    prompt = prompt.replace("{{datetime.now}}", dateTimeFormatted);

    // Replacements simples e condicionais
    const catalogName = config.catalog?.name || (config.services ? "Lista de Serviços" : "Opções");
    const itemName = config.catalog?.item_name || (config.services ? "serviço" : "item");
    
    prompt = prompt.replace(/{{store\.name}}/g, config.store.name);
    prompt = prompt.replace(/{{store\.type}}/g, config.store.type);
    prompt = prompt.replace(/{{store\.catalog_name}}/g, catalogName);
    prompt = prompt.replace(/{{store\.item_name}}/g, itemName);

    prompt = prompt.replace("{{hours.open}}", config.hours.open);
    prompt = prompt.replace("{{hours.close}}", config.hours.close);
    prompt = prompt.replace("{{hours.days_open}}", config.hours.days_open.join(", "));
    prompt = prompt.replace(/{{payments\.methods}}/g, config.payments.methods.join(", "));
    
    // Moeda (usada em delivery e serviços)
    const currency = config.catalog?.currency || "BRL";
    const currencySymbol = currency === "BRL" ? "R$" : currency;

    // Construção do Bloco de Regras de Entrega (apenas se delivery estiver habilitado)
    const deliveryRules: string[] = [];
    const deliveryScopeMention = config.delivery?.enabled
      ? "  - Entrega, retirada, taxas e horários"
      : "";
    const deliveryScopeMentionShort = config.delivery?.enabled ? ", entregas" : "";

    if (config.delivery?.enabled) {
      if (config.delivery.minimum_fee) {
        deliveryRules.push(
          `- Entrega: confirmar endereço sempre se for delivery, com valor de frete mínimo de: ${currencySymbol} ${config.delivery.minimum_fee.toFixed(
            2
          )}.`
        );
      } else {
        deliveryRules.push(`- Entrega: confirmar endereço sempre se for delivery.`);
      }

      if (config.delivery.packaging_fee) {
        const feeVal = config.delivery.packaging_fee.toFixed(2);
        const feeLabel = config.delivery.packaging_fee_label || "Taxa de embalagem";
        deliveryRules.push(
          `- Acréscimo por ${itemName} (caso for delivery ou retirada): ${currencySymbol} ${feeVal} (${feeLabel}).`
        );
        deliveryRules.push(
          `- Caso for retirada: tem o acréscimo de ${currencySymbol} ${feeVal} por ${itemName} (${feeLabel}).`
        );
      }

      if (config.delivery.eta_min && config.delivery.eta_max) {
        deliveryRules.push(
          `- Quando pedido for finalizado, tente não falar horário para buscar, mas se quiser, fale no mínimo: ${config.delivery.eta_min} a ${config.delivery.eta_max} min.`
        );
      }
      deliveryRules.push(`- Nunca falar que o Pedido está pronto imediatamente.`);
    }

    prompt = prompt.replace("{{delivery.rules_block}}", deliveryRules.length > 0 ? deliveryRules.join("\n") : "");
    prompt = prompt.replace("{{delivery.scope_mention}}", deliveryScopeMention);
    prompt = prompt.replace("{{delivery.scope_mention_short}}", deliveryScopeMentionShort);

    // Construção do Bloco de Regras de Negócio Extras
    const businessRules = config.llm.business_rules ? config.llm.business_rules.map((r) => `- ${r}`).join("\n") : "";
    prompt = prompt.replace("{{business.rules_block}}", businessRules);

    // Catálogo renderizado OU Lista de Serviços
    let finalRendered = menuRendered;
    
    // Se não tem menuRendered (veio vazio) mas tem services, renderiza os serviços
    if ((!finalRendered || finalRendered.trim() === "") && config.services && config.services.length > 0) {
        let servicesText = `*${config.store.name.toUpperCase()} - SERVIÇOS*\n\n`;
        config.services.forEach(svc => {
            const priceStr = svc.price ? ` - ${currencySymbol} ${svc.price.toFixed(2)}` : "";
            const durationStr = svc.duration_minutes ? ` (${svc.duration_minutes} min)` : "";
            servicesText += `• *${svc.name}*${priceStr}${durationStr}\n`;
            if (svc.description) servicesText += `  _${svc.description}_\n`;
        });
        finalRendered = servicesText;
    }

    prompt = prompt.replace(/{{catalog\.rendered}}/g, finalRendered);
    
    // Se ainda tiver {{catalog.rendered}} (caso menu seja nulo e sem serviços), remove
    prompt = prompt.replace(/{{catalog\.rendered}}/g, "Consulte disponibilidade.");

    // Tone instructions compostas
    const tone = `Greeting: ${config.tone.greeting}\nEstilo: ${config.tone.style}\nEmojis: ${config.tone.emojis}`;
    prompt = prompt.replace("{{tone.instructions}}", tone);

    return prompt;
  }
}
