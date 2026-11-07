import { auth, authSaltata } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (authSaltata() || req.auth || req.nextUrl.pathname === "/") return NextResponse.next();
  return NextResponse.redirect(new URL("/", req.url));
});
export const config = { matcher: ["/((?!api/auth|api/jobs|_next|favicon.ico).*)"] };
