import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { middleware } from "@/middleware";

vi.mock("@/lib/supabase/middleware", () => ({ updateSession: vi.fn() }));

function mockSession(role: string | null) {
  const response = NextResponse.next();
  response.cookies.set("test-session", "refreshed", { httpOnly: true, path: "/" });
  vi.mocked(updateSession).mockResolvedValue({
    supabaseResponse: response,
    user: role ? { app_metadata: { role } } as never : null,
  });
}

describe("route redirects", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["auditor", "/scan"],
    ["admin", "/dashboard"],
    ["master", "/admin"],
  ])("routes %s from the root and preserves refreshed cookies", async (role, target) => {
    mockSession(role);
    const response = await middleware(new NextRequest("https://example.com/"));
    expect(response.headers.get("location")).toBe(`https://example.com${target}`);
    expect(response.cookies.get("test-session")?.value).toBe("refreshed");
  });

  it("redirects unauthenticated visitors to login with updated cookies", async () => {
    mockSession(null);
    const response = await middleware(new NextRequest("https://example.com/dashboard"));
    expect(response.headers.get("location")).toBe("https://example.com/login");
    expect(response.cookies.get("test-session")?.httpOnly).toBe(true);
  });

  it("keeps auditors out of worker management", async () => {
    mockSession("auditor");
    const response = await middleware(new NextRequest("https://example.com/workers"));
    expect(response.headers.get("location")).toBe("https://example.com/scan");
  });
});
