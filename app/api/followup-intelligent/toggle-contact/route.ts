import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

/**
 * API para ativar/desativar follow-up AI para um contato específico
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { phoneNumber, isActive, sessionId } = body

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Número de telefone é obrigatório" },
        { status: 400 }
      )
    }

    if (typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: "isActive deve ser um valor booleano" },
        { status: 400 }
      )
    }

    const supabase = createBiaSupabaseServerClient()

    // Normaliza o número de telefone (remove espaços, traços, parênteses, etc)
    const normalizedPhone = phoneNumber.replace(/\D+/g, '')
    
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json(
        { error: "Número de telefone inválido" },
        { status: 400 }
      )
    }
    
    console.log(`[Toggle Follow-up] Buscando registro para: ${normalizedPhone}, sessão: ${sessionId || 'não informada'}`)

    // Busca o agendamento de follow-up para este número/sessão
    let query = supabase
      .from("followup_schedule")
      .select("*")
      .eq("phone_number", normalizedPhone)
    
    if (sessionId) {
      query = query.eq("session_id", sessionId)
    }

    const { data: existing, error: searchError } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (searchError && searchError.code !== 'PGRST116') {
      console.error("[Toggle Follow-up] Erro ao buscar registro:", searchError)
      throw searchError
    }
    
    console.log(`[Toggle Follow-up] Registro encontrado:`, existing ? 'Sim' : 'Não')

    // Se existe, atualiza o status
    if (existing) {
      console.log(`[Toggle Follow-up] Atualizando registro ${existing.id}, novo status: ${isActive}`)
      const { data, error } = await supabase
        .from("followup_schedule")
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) {
        console.error("[Toggle Follow-up] Erro ao atualizar:", error)
        throw error
      }

      console.log(`[Toggle Follow-up] Registro atualizado com sucesso`)
      return NextResponse.json({
        success: true,
        message: `Follow-up AI ${isActive ? 'ativado' : 'desativado'} para este contato`,
        data
      })
    } else {
      // Se não existe, cria um registro se estiver ativando
      if (isActive) {
        console.log(`[Toggle Follow-up] Criando novo registro para ${normalizedPhone}`)
        
        // Gera um session_id único se não fornecido
        const uniqueSessionId = sessionId || `temp_${normalizedPhone}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        
        const { data, error } = await supabase
          .from("followup_schedule")
          .insert({
            session_id: uniqueSessionId,
            phone_number: normalizedPhone,
            is_active: true,
            lead_status: 'active',
            last_interaction_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) {
          console.error("[Toggle Follow-up] Erro ao criar registro:", error)
          
          // Se o erro for de duplicata, tenta buscar o registro existente
          if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
            console.log("[Toggle Follow-up] Registro duplicado detectado, tentando buscar existente...")
            const { data: existingData, error: fetchError } = await supabase
              .from("followup_schedule")
              .select("*")
              .eq("phone_number", normalizedPhone)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
            
            if (!fetchError && existingData) {
              // Atualiza o registro existente
              const { data: updatedData, error: updateError } = await supabase
                .from("followup_schedule")
                .update({ is_active: true, updated_at: new Date().toISOString() })
                .eq("id", existingData.id)
                .select()
                .single()
              
              if (updateError) throw updateError
              
              console.log(`[Toggle Follow-up] Registro existente atualizado com sucesso`)
              return NextResponse.json({
                success: true,
                message: "Follow-up AI ativado para este contato",
                data: updatedData
              })
            }
          }
          
          throw error
        }

        console.log(`[Toggle Follow-up] Registro criado com sucesso`)
        return NextResponse.json({
          success: true,
          message: "Follow-up AI ativado para este contato",
          data
        })
      } else {
        // Não precisa criar registro se está desativando algo que não existe
        console.log(`[Toggle Follow-up] Registro não existe e está desativando, retornando sucesso`)
        return NextResponse.json({
          success: true,
          message: "Follow-up AI já estava desativado para este contato",
          data: { is_active: false }
        })
      }
    }
  } catch (error: any) {
    console.error("[Follow-up Toggle Contact] Erro completo:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error
    })
    
    // Mensagem mais específica baseada no tipo de erro
    let errorMessage = "Erro ao atualizar follow-up do contato"
    if (error?.message) {
      errorMessage = error.message
    } else if (error?.code === 'PGRST116') {
      errorMessage = "Registro não encontrado"
    } else if (error?.code === '23505') {
      errorMessage = "Já existe um registro para este contato"
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      },
      { status: 500 }
    )
  }
}

/**
 * Busca status do follow-up para um contato específico
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const phoneNumber = searchParams.get("phoneNumber")
    const sessionId = searchParams.get("sessionId")

    if (!phoneNumber) {
      return NextResponse.json(
        { error: "Número de telefone é obrigatório" },
        { status: 400 }
      )
    }

    const supabase = createBiaSupabaseServerClient()

    // Normaliza o número de telefone
    const normalizedPhone = phoneNumber.replace(/\D+/g, '')
    
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return NextResponse.json(
        { error: "Número de telefone inválido" },
        { status: 400 }
      )
    }
    
    console.log(`[Get Follow-up Status] Buscando status para: ${normalizedPhone}, sessão: ${sessionId || 'não informada'}`)

    // Busca o agendamento de follow-up
    let query = supabase
      .from("followup_schedule")
      .select("*")
      .eq("phone_number", normalizedPhone)
    
    if (sessionId) {
      query = query.eq("session_id", sessionId)
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error("[Get Follow-up Status] Erro ao buscar:", error)
      throw error
    }

    const isActive = data?.is_active ?? false
    console.log(`[Get Follow-up Status] Status encontrado: ${isActive ? 'Ativo' : 'Inativo'}`)

    return NextResponse.json({
      success: true,
      data: {
        isActive,
        followupSchedule: data
      }
    })
  } catch (error: any) {
    console.error("[Get Follow-up Status] Erro completo:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error
    })
    
    // Se for erro de "não encontrado", retorna false (follow-up desativado)
    if (error?.code === 'PGRST116' || error?.message?.includes('not found')) {
      return NextResponse.json({
        success: true,
        data: {
          isActive: false,
          followupSchedule: null
        }
      })
    }
    
    return NextResponse.json(
      { 
        error: error?.message || "Erro ao buscar status do follow-up",
        code: error?.code,
        details: error?.details
      },
      { status: 500 }
    )
  }
}
