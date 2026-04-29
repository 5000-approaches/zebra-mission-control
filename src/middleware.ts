import { NextResponse } from "next/server";
import { auth } from "@/auth";

// BYPASS_AUTH=true skips auth in CI/e2e environments where no session is available
export const middleware = process.env.BYPASS_AUTH === "true"
  ? () => NextResponse.next()
  : auth;

export const config = {
  matcher: ["/((?!api/|auth|_next/static|_next/image|favicon.ico).*)"],
};
