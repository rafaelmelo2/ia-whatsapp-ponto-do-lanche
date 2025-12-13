import { z } from "zod";

export const ConfigSchema = z.object({
  workflow: z
    .object({
      type: z.enum(["commerce", "appointment", "auto"]).default("auto"),
      // Permite habilitar features explicitamente se necessário
      features: z.array(z.string()).optional()
    })
    .optional()
    .default({ type: "auto" }),
  store: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string().default("Loja"),
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
  delivery: z
    .object({
      enabled: z.boolean(),
      fee_by_neighborhood: z.boolean().optional(),
      eta_min: z.number().optional(),
      eta_max: z.number().optional(),
      minimum_fee: z.number().optional(),
      packaging_fee: z.number().optional(), // Taxa de embalagem por item (genérico)
      packaging_fee_label: z.string().optional().default("Taxa de embalagem") // Label customizável
    })
    .optional(), // Delivery agora é opcional - nem todo comércio precisa
  catalog: z
    .object({
      // Opção 1: Carregar de uma API (prioridade se ambos estiverem definidos)
      api_url: z.string().optional(),
      // Opção 2: Carregar de um arquivo JSON local (caminho relativo a src/clients/{clientId}/)
      json_path: z.string().optional(),
      currency: z.string().default("BRL"),
      name: z.string().default("Catálogo"), // Nome do catálogo (ex: "Cardápio", "Catálogo", "Lista de Produtos")
      item_name: z.string().default("item"), // Nome genérico do item (ex: "produto", "peça", "sanduíche")
      // Mapeamento de campos (opcional) - permite estruturas JSON diferentes
      field_mapping: z
        .object({
          name: z.string().default("name"), // Campo que contém o nome do produto
          price: z.string().default("basePrice"), // Campo que contém o preço
          category: z.string().default("category.name"), // Caminho para a categoria (ex: "category.name" ou "categoria")
          active: z.string().optional(), // Campo que indica se está ativo (se não existir, assume true)
          showOnWebsite: z.string().optional() // Campo que indica se deve aparecer (se não existir, assume true)
        })
        .optional(),
      categories: z
        .record(
          z.object({
            emoji: z.string(),
            name: z.string()
          })
        )
        .optional(),
      category_order: z.array(z.string()).optional()
    })
    .optional() // Catálogo agora é opcional (pode ser só agendamento)
    .refine((data) => !data || data.api_url || data.json_path, {
      message: "Se definido, catalog deve ter 'api_url' OU 'json_path'"
    }),
  services: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        price: z.number().optional(),
        duration_minutes: z.number().optional()
      })
    )
    .optional(), // Lista de serviços para agendamento
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
    max_tokens: z.number(),
    business_rules: z.array(z.string()).optional()
  }),
  test: z
    .object({
      enabled: z.boolean(),
      message: z.string()
    })
    .optional(),
  conversation: z
    .object({
      timeout_minutes: z.number().default(5) // Timeout em minutos (padrão: 5 minutos)
    })
    .optional(),
  locale: z
    .object({
      timezone: z.string().default("America/Sao_Paulo"), // Timezone (ex: "America/Sao_Paulo", "America/New_York", "Europe/London")
      language: z.string().default("pt-BR") // Locale para formatação (ex: "pt-BR", "en-US", "es-ES")
    })
    .optional()
});

export type AppConfig = z.infer<typeof ConfigSchema>;
