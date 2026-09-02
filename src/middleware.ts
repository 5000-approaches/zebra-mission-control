import { NextResponse } from "next/server";
import { auth } from "@/auth";

// BYPASS_AUTH=true skips auth in CI/e2e environments where no session is
// available. It is never honored on the production deployment.
const isBypassed = process.env.BYPASS_AUTH === "true" && process.env.VERCEL_ENV !== "production";

export const middleware = isBypassed ? () => NextResponse.next() : auth;

export const config = {
  matcher: ["/((?!api/|auth|_next/static|_next/image|favicon.ico).*)"],
};
