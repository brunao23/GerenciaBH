import { NextResponse } from "next/server"
import { mockSDRs } from "@/lib/mock-data"

export async function GET() {
  return NextResponse.json(mockSDRs)
}
