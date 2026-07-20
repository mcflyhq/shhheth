import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FLOW_HOSTS = new Set(["flow.shhheth.com", "www.flow.shhheth.com"]);

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  );
}

/**
 * flow.shhheth.com is the only public surface for Tornado flow.
 * Internal app route stays at /flow; main site never exposes it.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  const { pathname } = request.nextUrl;
  const isFlowPath =
    pathname === "/flow" || pathname.startsWith("/flow/");

  // Production flow host: / → internal /flow; bare /flow → /
  if (FLOW_HOSTS.has(host)) {
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/flow";
      return NextResponse.rewrite(url);
    }
    if (isFlowPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url, 308);
    }
    return NextResponse.next();
  }

  // Local: keep /flow for dev without a subdomain
  if (isLocalHost(host)) {
    return NextResponse.next();
  }

  // Main / preview hosts: never serve /flow — send traffic to the subdomain
  if (isFlowPath) {
    const dest = new URL("https://flow.shhheth.com/");
    return NextResponse.redirect(dest, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/flow", "/flow/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
