import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const authToken = request.cookies.get("auth_token")?.value;

  console.log(
    `[Middleware] ${pathname} | auth_token: ${authToken ? "PRESENT" : "MISSING"}`,
  );

  const protectedRoutes = [
    "/profile",
    "/command-center",
    "/detection",
    "/cnn",
    "/analytics",
    "/intelligence",
    "/combat",
    "/launch",
    "/periscope",
    "/war-room",
    "/mission-planner",
    "/threat-prediction",
  ];
  const authPages = ["/auth/login", "/auth/register"];

  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthPage = authPages.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtectedRoute && !authToken) {
    console.log(`[Middleware] REDIRECT → /try (no auth_token for ${pathname})`);
    return NextResponse.redirect(new URL("/try", request.url));
  }

  if (isAuthPage && authToken) {
    return NextResponse.redirect(new URL("/profile", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/profile",
    "/profile/:path*",
    "/command-center",
    "/command-center/:path*",
    "/detection",
    "/detection/:path*",
    "/cnn",
    "/cnn/:path*",
    "/analytics",
    "/analytics/:path*",
    "/intelligence",
    "/intelligence/:path*",
    "/combat",
    "/combat/:path*",
    "/launch",
    "/launch/:path*",
    "/periscope",
    "/periscope/:path*",
    "/war-room",
    "/war-room/:path*",
    "/mission-planner",
    "/mission-planner/:path*",
    "/threat-prediction",
    "/threat-prediction/:path*",
    "/auth/login",
    "/auth/register",
  ],
};
