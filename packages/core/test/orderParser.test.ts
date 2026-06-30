import { describe, expect, test } from "bun:test";
import { OrderParser } from "../src/orders/orderParser.js";

describe("OrderParser", () => {
  const input = `
  Claro! Aqui está o seu pedido confirmado.

  <<<JSON
  {
    "items": [
      { "name": "X-Bacon", "quantity": 2, "observation": "sem salada" }
    ],
    "deliveryNeeded": true,
    "address": "Rua das Flores, 123",
    "paymentMethod": "Pix"
  }
  >>>

  Obrigado pela preferência!
  `;

  test("extrai o pedido do bloco JSON", () => {
    const parser = new OrderParser();
    const result = parser.extract(input);

    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.quantity).toBe(2);
    expect(result?.deliveryNeeded).toBe(true);
    expect(result?.paymentMethod).toBe("Pix");
  });

  test("remove o bloco JSON preservando o texto", () => {
    const parser = new OrderParser();
    const clean = parser.cleanResponse(input);

    expect(clean).not.toContain("<<<JSON");
    expect(clean).toContain("Claro!");
  });
});
