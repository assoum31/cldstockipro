import React from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/client";
import LoginPage from "@/app/login/page";
import DashboardPage from "@/app/dashboard/page";
import ScanPage from "@/app/scan/page";
import { LogoutButton } from "@/components/logout-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => { throw new Error("Browser client initialized during prerender"); }),
}));

// Support the classic JSX transform used by this test environment.
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("page prerendering", () => {
  beforeEach(() => { vi.mocked(createClient).mockClear(); });

  it.each([
    ["login", LoginPage],
    ["dashboard", DashboardPage],
    ["scan", ScanPage],
    ["logout button", LogoutButton],
  ] as const)("renders %s without initializing the Supabase browser client", (_name, Component) => {
    expect(renderToString(React.createElement(Component))).not.toBe("");
    expect(createClient).not.toHaveBeenCalled();
  });
});
