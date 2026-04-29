import { NextResponse } from "next/server";

type PowerOfficeConfig = {
  url: string;
  key: string;
};

export async function GET() {
  return NextResponse.json({
    url: process.env.POWEROFFICE_MCP_URL ?? "",
    key: process.env.POWEROFFICE_MCP_KEY ?? "",
  });
}

export async function PATCH(req: Request) {
  let body: Partial<PowerOfficeConfig>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Values can only be persisted by updating Vercel environment variables.
  // Return the submitted values so the UI can confirm receipt.
  return NextResponse.json({
    url: body.url ?? "",
    key: body.key ?? "",
    note: "Values received. Update POWEROFFICE_MCP_URL and POWEROFFICE_MCP_KEY in Vercel to apply.",
  });
}
