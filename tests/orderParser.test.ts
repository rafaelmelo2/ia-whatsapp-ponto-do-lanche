import { OrderParser } from '../src/core/orders/orderParser';

// Mock simples para teste (idealmente usar Jest/Mocha)
function testOrderParser() {
  const parser = new OrderParser();
  
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

  const result = parser.extract(input);
  const clean = parser.cleanResponse(input);

  console.log("Teste OrderParser:");
  if (result && result.items.length === 2 && result.deliveryNeeded === true) {
    console.log("✅ Extraction OK");
  } else {
    console.error("❌ Extraction Failed", result);
  }

  if (!clean.includes("<<<JSON") && clean.includes("Claro!")) {
    console.log("✅ Clean OK");
  } else {
    console.error("❌ Clean Failed", clean);
  }
}

testOrderParser();

