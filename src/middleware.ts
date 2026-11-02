import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canOpenPath } from "@/lib/access";
import { homeFor } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: this call refreshes the session cookie. Don't remove it —
  // without it, sessions silently expire in the browser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isDashboard = path.startsWith("/dashboard");

  if (isDashboard) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }

    // Look up the caller's role (and whether the account is still active).
    const first = await supabase.from("profiles").select("role, active").eq("id", user.id).single();
    let profile = first.data;
    const profileErr = first.error;
    if (profileErr) {
      // Before database update 0010 there is no "active" column yet: fall back to the role alone.
      profile = (await supabase.from("profiles").select("role").eq("id", user.id).single()).data as typeof profile;
    }
    const role = profile?.role ?? null;

    if (profile && profile.active === false) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "?reason=deactivated";
      return NextResponse.redirect(url);
    }

    if (!canOpenPath(role, path)) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }

    // Bare /dashboard → send them to their own role's home.
    if (path === "/dashboard" || path === "/dashboard/") {
      const url = request.nextUrl.clone();
      url.pathname = homeFor(role);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
