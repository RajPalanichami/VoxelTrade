import { NextResponse } from "next/server";
import { getSettings } from "@/src/config/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const settings = getSettings();
  return NextResponse.json({ ok: true, service: "pro-trader-api", version: settings.algorithmVersion });
}
