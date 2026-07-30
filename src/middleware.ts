import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "is_session";

const PUBLIC = [
  "/login",
  "/api/trpc",
  "/api/internal/blob-audit",
  "/_next",
  "/favicon.ico",
];

function isPublic(path: string) {
  if (path.startsWith("/review/")) return true;
  return PUBLIC.some((p) => path.startsWith(p));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};
