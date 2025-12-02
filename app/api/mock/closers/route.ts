import { NextResponse } from "next/server"
import { mockClosersExpanded } from "@/lib/mock-data"

export async function GET() {
  return NextResponse.json(mockClosersExpanded)
}
