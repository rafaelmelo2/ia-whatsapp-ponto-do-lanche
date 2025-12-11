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

  build(config: AppConfig, menuRendered: string): string {
    let prompt = this.template;

    // Teste
    prompt = prompt.replace("{{isTest}}", config.test?.enabled ? config.test.message : "");

    // Data e hora atual
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      timeZone: "America/Sao_Paulo"
    });
    const dateTimeFormatted = now.toLocaleString("pt-BR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo"
    });
    prompt = prompt.replace("{{datetime.dayOfWeek}}", dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1));
    prompt = prompt.replace("{{datetime.now}}", dateTimeFormatted);

    // Replacements simples (usando regex global para substituir todas as ocorrências)
    prompt = prompt.replace(/{{store\.name}}/g, config.store.name);
    prompt = prompt.replace(/{{store\.type}}/g, config.store.type);
    prompt = prompt.replace(/{{store\.catalog_name}}/g, config.catalog.name);
    prompt = prompt.replace(/{{store\.item_name}}/g, config.catalog.item_name);

    prompt = prompt.replace("{{hours.open}}", config.hours.open);
    prompt = prompt.replace("{{hours.close}}", config.hours.close);
    prompt = prompt.replace("{{hours.days_open}}", config.hours.days_open.join(", "));
    prompt = prompt.replace(/{{payments\.methods}}/g, config.payments.methods.join(", "));

    // Construção do Bloco de Regras de Entrega
    const deliveryRules: string[] = [];

    if (config.delivery.minimum_fee) {
      deliveryRules.push(
        `- Entrega: confirmar endereço sempre se for delivery, com valor de frete mínimo de: R$ ${config.delivery.minimum_fee.toFixed(
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
        `- Acréscimo por ${config.catalog.item_name} (caso for delivery ou retirada): R$ ${feeVal} (${feeLabel}).`
      );
      deliveryRules.push(`- Caso for retirada: tem o acréscimo de R$ ${feeVal} por ${config.catalog.item_name} (${feeLabel}).`);
    }

    deliveryRules.push(
      `- Quando pedido for finalizado, tente não falar horário para buscar, mas se quiser, fale no mínimo: ${config.delivery.eta_min} a ${config.delivery.eta_max} min.`
    );
    deliveryRules.push(`- Nunca falar que o Pedido está pronto imediatamente.`);

    prompt = prompt.replace("{{delivery.rules_block}}", deliveryRules.join("\n"));

    // Construção do Bloco de Regras de Negócio Extras
    const businessRules = config.llm.business_rules ? config.llm.business_rules.map((r) => `- ${r}`).join("\n") : "";
    prompt = prompt.replace("{{business.rules_block}}", businessRules);

    // Catálogo renderizado
    prompt = prompt.replace(/{{catalog\.rendered}}/g, menuRendered);

    // Tone instructions compostas
    const tone = `Greeting: ${config.tone.greeting}\nEstilo: ${config.tone.style}\nEmojis: ${config.tone.emojis}`;
    prompt = prompt.replace("{{tone.instructions}}", tone);

    return prompt;
  }
}
