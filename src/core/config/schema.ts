import { z } from "zod";

export const ConfigSchema = z.object({
  store: z.object({
    id: z.string(),
    name: z.string(),
    phone: z.string()
  }),
  hours: z.object({
    open: z.string(),
    close: z.string(),
    days_open: z.array(z.string())
  }),
  payments: z.object({
    methods: z.array(z.string())
  }),
  delivery: z.object({
    enabled: z.boolean(),
    fee_by_neighborhood: z.boolean().optional(),
    eta_min: z.number(),
    eta_max: z.number(),
    surcharge_per_sandwich: z.number().optional()
  }),
  menu: z.object({
    api_url: z.string(),
    currency: z.string().default("BRL")
  }),
  upsell: z.object({
    default_suggestions: z.array(z.string()),
    best_sellers_tag: z.string()
  }),
  tone: z.object({
    greeting: z.string(),
    emojis: z.string(),
    style: z.string()
  }),
  llm: z.object({
    model: z.string(),
    temperature: z.number(),
    max_tokens: z.number()
  })
});

export type AppConfig = z.infer<typeof ConfigSchema>;
