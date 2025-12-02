import { NextResponse } from "next/server"
import { mockAgendamentos } from "@/lib/mock-data"

export async function GET() {
  return NextResponse.json(mockAgendamentos)
}
