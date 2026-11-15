import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every matched request (Next.js 16 "proxy", formerly middleware).
 *
 * 1. Refreshes the Supabase session cookie so Server Components see a valid session.
 * 2. Redirects signed-out visitors to /login with a real HTTP redirect.
 *
 * This is an optimistic check only. Authorisation is enforced again in the data
 * layer (`getSessionContext`) and by Row Level Security in the database.
 */

// Routes that authenticate by other means (signature or token) or are public.
const PUBLIC_PREFIXES = ["/login", "/api/webhooks", "/api/health", "/unsubscribe"];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Without configuration nobody can be signed in. Send them to the login page,
  // which explains what is missing.
  if (!url || !key) {
    if (isPublic) return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    // Auth service unreachable: treat as signed out. The login page reports backend status.
    signedIn = false;
  }

  if (!signedIn && !isPublic) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
