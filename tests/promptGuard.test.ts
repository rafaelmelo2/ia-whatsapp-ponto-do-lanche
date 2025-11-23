import { PromptGuard } from "../src/core/llm/guard";

function testGuard() {
  const guard = new PromptGuard();

  console.log("Teste PromptGuard:");

  const badInput = "# Título Ruim\nConteúdo";
  const goodInput = "*Título Bom*\nConteúdo";

  const r1 = guard.validate(badInput);
  if (!r1.isValid) {
    console.log("✅ Bloqueou Markdown (#) corretamente");
  } else {
    console.error("❌ Falhou ao bloquear Markdown (#)");
  }

  const r2 = guard.validate(goodInput);
  if (r2.isValid) {
    console.log("✅ Permitiu negrito corretamente");
  } else {
    console.error("❌ Bloqueou negrito incorretamente");
  }
}

testGuard();
