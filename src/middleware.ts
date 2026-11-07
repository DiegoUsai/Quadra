import { auth, authSaltata } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const p = req.nextUrl.pathname;
  if (authSaltata() || req.auth || p === "/") return NextResponse.next();
  if (p.startsWith("/api/")) return new NextResponse("non autorizzato", { status: 401 });
  return NextResponse.redirect(new URL("/", req.url));
});
export const config = { matcher: ["/((?!api/auth|api/jobs|api/hook|_next|favicon.ico).*)"] };
