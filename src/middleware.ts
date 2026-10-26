import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { AppRole } from "@/lib/database.types";

// Which role is allowed under each /dashboard/<segment> path.
const ROLE_FOR_SEGMENT: Record<string, AppRole> = {
  "super-admin": "super_admin",
  "company-admin": "company_admin",
  driver: "driver",
  employee: "employee",
};

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

    // Look up the caller's role to enforce per-segment access.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const segment = path.split("/")[2]; // "/dashboard/<segment>/..."
    const requiredRole = ROLE_FOR_SEGMENT[segment];

    if (requiredRole && profile?.role !== requiredRole && profile?.role !== "super_admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }

    // Bare /dashboard → send them to their own role's home.
    if (path === "/dashboard" || path === "/dashboard/") {
      const url = request.nextUrl.clone();
      url.pathname = `/dashboard/${(profile?.role ?? "employee").replace("_", "-")}`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
