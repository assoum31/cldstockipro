import { describe, it, expect } from "vitest";
import { isNetworkError } from "@/lib/offline-queue";

describe("isNetworkError", () => {
  it("reconnaît une erreur fetch typique (Chrome)", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("reconnaît une erreur réseau typique (Firefox)", () => {
    expect(
      isNetworkError(
        new TypeError("NetworkError when attempting to fetch resource.")
      )
    ).toBe(true);
  });

  it("ne confond pas une erreur métier avec une erreur réseau", () => {
    expect(isNetworkError(new Error("الكمية غير صالحة."))).toBe(false);
  });

  it("gère une valeur qui n'est même pas une Error", () => {
    expect(isNetworkError("juste une chaîne")).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});
