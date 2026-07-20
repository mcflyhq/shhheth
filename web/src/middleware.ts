import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const FLOW_HOSTS = new Set(["flow.shhheth.com", "www.flow.shhheth.com"]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (!FLOW_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/" || pathname === "") {
    const url = request.nextUrl.clone();
    url.pathname = "/flow/grid";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
