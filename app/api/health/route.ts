import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "soyl-forms",
    version: "0.1.0",
    time: new Date().toISOString(),
  });
}
