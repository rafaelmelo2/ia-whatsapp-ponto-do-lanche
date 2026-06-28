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

    // Replacements simples
    prompt = prompt.replace("{{store.name}}", config.store.name);
    prompt = prompt.replace("{{hours.open}}", config.hours.open);
    prompt = prompt.replace("{{hours.close}}", config.hours.close);
    prompt = prompt.replace("{{hours.days_open}}", config.hours.days_open.join(", "));
    prompt = prompt.replace("{{payments.methods}}", config.payments.methods.join(", "));

    const surcharge = config.delivery.surcharge_per_sandwich ? `R$ ${config.delivery.surcharge_per_sandwich.toFixed(2)}` : "Não há";
    prompt = prompt.replace("{{delivery.surcharge_per_sandwich}}", surcharge);

    const minFee = config.delivery.minimum_fee ? `R$ ${config.delivery.minimum_fee.toFixed(2)}` : "A consultar";
    prompt = prompt.replace("{{delivery.minimum_fee}}", minFee);

    prompt = prompt.replace("{{menu.rendered}}", menuRendered);

    // Tone instructions compostas
    const tone = `Greeting: ${config.tone.greeting}\nEstilo: ${config.tone.style}\nEmojis: ${config.tone.emojis}`;
    prompt = prompt.replace("{{tone.instructions}}", tone);

    return prompt;
  }
}
