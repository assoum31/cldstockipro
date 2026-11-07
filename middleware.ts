import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Garde de session + de rôle (RBAC côté routing, en plus de RLS
// côté base de données — défense en profondeur) :
// - non connecté       -> /login
// - déjà connecté       -> /login redirige vers son espace par défaut
// - role 'auditor'      -> restreint strictement à /scan
// - /admin/*             -> réservé au role 'master'
export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const response = NextResponse.redirect(url);
    // Keep refreshed auth cookies when routing to another page.
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  const isLoginRoute = pathname === "/login";

  if (!user && !isLoginRoute) {
    return redirectTo("/login");
  }

  if (user) {
    const role = (user.app_metadata as { role?: string } | undefined)?.role;

    if (isLoginRoute || pathname === "/") {
      return redirectTo(role === "auditor" ? "/scan" : role === "master" ? "/admin" : "/dashboard");
    }

    if (role === "auditor" && !pathname.startsWith("/scan")) {
      return redirectTo("/scan");
    }

    if (pathname.startsWith("/admin") && role !== "master") {
      return redirectTo("/dashboard");
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
