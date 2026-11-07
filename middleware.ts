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

  const isLoginRoute = pathname === "/login";

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const role = (user.app_metadata as { role?: string } | undefined)?.role;

    if (isLoginRoute) {
      const url = request.nextUrl.clone();
      url.pathname = role === "auditor" ? "/scan" : "/dashboard";
      return NextResponse.redirect(url);
    }

    if (role === "auditor" && !pathname.startsWith("/scan")) {
      const url = request.nextUrl.clone();
      url.pathname = "/scan";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin") && role !== "master") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
