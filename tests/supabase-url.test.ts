import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

describe("Supabase project URL", () => {
  it.each([
    "https://example.supabase.co",
    "https://example.supabase.co/",
    "https://example.supabase.co/rest/v1",
    " https://example.supabase.co/rest/v1/ ",
  ])("normalizes %s to the project root", (url) => {
    expect(normalizeSupabaseUrl(url)).toBe("https://example.supabase.co");
  });

  it.each([undefined, "", "   "])("rejects missing configuration", (url) => {
    expect(() => normalizeSupabaseUrl(url)).toThrow("Supabase project URL is not configured.");
  });
});
