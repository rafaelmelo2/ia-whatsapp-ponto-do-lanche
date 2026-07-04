import { describe, expect, test } from "bun:test";
import { extractInstanceName, parseEvolutionWebhook } from "../src/whatsapp/evolution/index.ts";

const TEXT_PAYLOAD = {
  event: "messages.upsert",
  instance: "5511999990001",
  data: {
    key: { remoteJid: "5511888887777@s.whatsapp.net", fromMe: false, id: "3EB0C767D097E9ECFE" },
    pushName: "Cliente Teste",
    message: { conversation: "Oi, quero um lanche" },
    messageType: "conversation"
  }
};

describe("EvolutionApiProvider — parseWebhook", () => {
  test("extrai mensagem de texto simples", () => {
    const msg = parseEvolutionWebhook(TEXT_PAYLOAD);
    expect(msg).toEqual({
      from: "5511888887777",
      body: "Oi, quero um lanche",
      pushName: "Cliente Teste",
      isGroup: false,
      messageId: "3EB0C767D097E9ECFE"
    });
  });

  test("ignora eco do próprio bot (fromMe: true)", () => {
    const payload = {
      ...TEXT_PAYLOAD,
      data: { ...TEXT_PAYLOAD.data, key: { ...TEXT_PAYLOAD.data.key, fromMe: true } }
    };
    expect(parseEvolutionWebhook(payload)).toBeNull();
  });

  test("identifica mensagem de grupo pelo sufixo @g.us", () => {
    const payload = {
      ...TEXT_PAYLOAD,
      data: {
        ...TEXT_PAYLOAD.data,
        key: { ...TEXT_PAYLOAD.data.key, remoteJid: "120363000000@g.us" }
      }
    };
    expect(parseEvolutionWebhook(payload)?.isGroup).toBe(true);
  });

  test("ignora evento que não é messages.upsert", () => {
    expect(parseEvolutionWebhook({ ...TEXT_PAYLOAD, event: "connection.update" })).toBeNull();
  });

  test("ignora mensagem sem corpo de texto (ex: mídia)", () => {
    const payload = { ...TEXT_PAYLOAD, data: { ...TEXT_PAYLOAD.data, message: {} } };
    expect(parseEvolutionWebhook(payload)).toBeNull();
  });
});

describe("EvolutionApiProvider — extractInstanceName", () => {
  test("extrai o nome da instância (= wa_number do tenant)", () => {
    expect(extractInstanceName(TEXT_PAYLOAD)).toBe("5511999990001");
  });

  test("payload inválido retorna null", () => {
    expect(extractInstanceName(null)).toBeNull();
    expect(extractInstanceName("string qualquer")).toBeNull();
  });
});
