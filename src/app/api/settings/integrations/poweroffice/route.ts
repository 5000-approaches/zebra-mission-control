import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";

const PROJECT_ID = process.env.VERCEL_PROJECT_ID || "prj_HZ7O1JQbLkcGcjsOh8KrluX3RG6r";
const ENV_IDS = {
  url: "PAZUZkARfkuvSUBM",
  key: "jyQoOo8x6T4AdCxA",
} as const;

async function readEnvVar(envId: string): Promise<string> {
  const token = process.env.VERCEL_ADMIN_TOKEN;
  if (!token) return "";
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${envId}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) return "";
  const data = await res.json() as { value?: string };
  return data.value ?? "";
}

async function writeEnvVar(envId: string, value: string): Promise<boolean> {
  const token = process.env.VERCEL_ADMIN_TOKEN;
  if (!token) return false;
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${envId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    }
  );
  return res.ok;
}

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  const [url, key] = await Promise.all([
    readEnvVar(ENV_IDS.url),
    readEnvVar(ENV_IDS.key),
  ]);
  return NextResponse.json({ url, key });
}

export async function PATCH(req: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  let body: { url?: string; key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Promise<boolean>[] = [];
  if (body.url !== undefined) updates.push(writeEnvVar(ENV_IDS.url, body.url));
  if (body.key !== undefined) updates.push(writeEnvVar(ENV_IDS.key, body.key));

  const results = await Promise.all(updates);
  if (results.includes(false)) {
    return NextResponse.json({ error: "Failed to update one or more values" }, { status: 500 });
  }

  return NextResponse.json({ url: body.url ?? "", key: body.key ?? "" });
}
