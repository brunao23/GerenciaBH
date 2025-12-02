import { NextResponse } from "next/server"
import { mockChats } from "@/lib/mock-data"

export async function GET() {
  return NextResponse.json(mockChats)
}
