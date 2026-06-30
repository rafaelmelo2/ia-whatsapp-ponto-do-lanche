import { describe, expect, test } from "bun:test";
import { PromptGuard } from "../src/llm/guard.js";

describe("PromptGuard", () => {
  test("bloqueia headers Markdown (#)", () => {
    const guard = new PromptGuard();
    const result = guard.validate("# Título Ruim\nConteúdo");

    expect(result.isValid).toBe(false);
  });

  test("permite negrito (*)", () => {
    const guard = new PromptGuard();
    const result = guard.validate("*Título Bom*\nConteúdo");

    expect(result.isValid).toBe(true);
  });
});
