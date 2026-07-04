import { describe, expect, test } from "bun:test";
import {
  extractPhoneNumberId,
  parseCloudApiWebhook,
  verifyMetaSignature
} from "../src/whatsapp/cloud-api/index.ts";

const TEXT_PAYLOAD = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "123456789012345", display_phone_number: "5511999999999" },
            contacts: [{ profile: { name: "Cliente Teste" } }],
            messages: [
              {
                from: "5511888887777",
                id: "wamid.ABC123",
                type: "text",
                text: { body: "Oi, quero um lanche" }
              }
            ]
          }
        }
      ]
    }
  ]
};

describe("CloudApiProvider — parseWebhook", () => {
  test("extrai mensagem de texto", () => {
    expect(parseCloudApiWebhook(TEXT_PAYLOAD)).toEqual({
      from: "5511888887777",
      body: "Oi, quero um lanche",
      pushName: "Cliente Teste",
      isGroup: false,
      messageId: "wamid.ABC123"
    });
  });

  test("ignora mensagem que não é texto (ex: imagem)", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ from: "5511888887777", id: "x", type: "image" }] } }] }
      ]
    };
    expect(parseCloudApiWebhook(payload)).toBeNull();
  });

  test("payload sem mensagens (ex: status update) retorna null", () => {
    expect(parseCloudApiWebhook({ entry: [{ changes: [{ value: {} }] }] })).toBeNull();
  });
});

describe("CloudApiProvider — extractPhoneNumberId", () => {
  test("extrai o phone_number_id", () => {
    expect(extractPhoneNumberId(TEXT_PAYLOAD)).toBe("123456789012345");
  });

  test("payload inválido retorna null", () => {
    expect(extractPhoneNumberId(null)).toBeNull();
  });
});

describe("CloudApiProvider — verifyMetaSignature", () => {
  const APP_SECRET = "segredo-de-teste";

  test("aceita assinatura válida", async () => {
    const body = JSON.stringify({ hello: "world" });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
    );
    const hex = Array.from(sigBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifyMetaSignature(body, `sha256=${hex}`, APP_SECRET)).toBe(true);
  });

  test("rejeita assinatura errada", async () => {
    expect(await verifyMetaSignature("{}", "sha256=deadbeef", APP_SECRET)).toBe(false);
  });

  test("rejeita header ausente", async () => {
    expect(await verifyMetaSignature("{}", null, APP_SECRET)).toBe(false);
  });
});
