import { auth } from "@/auth";

const SECRET_HEADER = "x-api-secret";

/** BYPASS_AUTH is for CI/e2e only; it is never honored on the production deployment. */
export function isAuthBypassed(): boolean {
  return process.env.BYPASS_AUTH === "true" && process.env.VERCEL_ENV !== "production";
}

/**
 * Session gate for API routes. The middleware matcher excludes /api/, so
 * routes that read or write secrets must call this themselves.
 * Returns null when the request may proceed, otherwise a 401 response.
 */
export async function requireSession(): Promise<Response | null> {
  if (isAuthBypassed()) return null;
  try {
    const session = await auth();
    if (session?.user) return null;
  } catch {
    // fall through to 401
  }
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Accepts machine callers presenting the shared FORECAST_API_SECRET (when one
 * is configured); everyone else needs a signed-in session.
 */
export async function requireSessionOrApiSecret(req: Request): Promise<Response | null> {
  const apiSecret = process.env.FORECAST_API_SECRET;
  if (apiSecret && req.headers.get(SECRET_HEADER) === apiSecret) return null;
  return requireSession();
}
