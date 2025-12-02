import { NextResponse } from "next/server"
import { mockAgendamentos, mockChats, mockClosers, mockSDRs } from "@/lib/mock-data"

export async function GET() {
  return NextResponse.json({
    conversas: mockChats.length,
    agendamentos: mockAgendamentos.length,
    sdrs: mockSDRs.length,
    closers: mockClosers.length,
  })
}
