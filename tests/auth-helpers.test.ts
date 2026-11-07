import { describe, it, expect } from "vitest";
import {
  buildSyntheticEmail,
  generatePin,
  hashPin,
  verifyPin,
} from "@/lib/auth-helpers";

describe("buildSyntheticEmail", () => {
  it("combine username + code tenant, tout en minuscules", () => {
    expect(buildSyntheticEmail("TESTA1", "Ahmed")).toBe(
      "ahmed@testa1.stockipro.internal"
    );
  });

  it("deux tenants différents donnent deux emails différents pour le même username", () => {
    const a = buildSyntheticEmail("TESTA1", "ahmed");
    const b = buildSyntheticEmail("TESTB1", "ahmed");
    expect(a).not.toBe(b);
  });
});

describe("generatePin", () => {
  it("génère toujours 6 chiffres", () => {
    for (let i = 0; i < 20; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashPin / verifyPin", () => {
  it("vérifie correctement le bon PIN", async () => {
    const pin = "482913";
    const hash = await hashPin(pin);
    expect(await verifyPin(pin, hash)).toBe(true);
  });

  it("rejette un mauvais PIN", async () => {
    const hash = await hashPin("482913");
    expect(await verifyPin("000000", hash)).toBe(false);
  });

  it("ne stocke jamais le PIN en clair dans le hash", async () => {
    const pin = "482913";
    const hash = await hashPin(pin);
    expect(hash).not.toContain(pin);
  });
});
