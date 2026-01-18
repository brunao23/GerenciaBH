import { NextResponse } from "next/server"
import { createBiaSupabaseServerClient } from "@/lib/supabase/bia-client"

/**
 * API para gerenciar templates de follow-up
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get("action")

    if (action === "listar") {
      const supabase = createBiaSupabaseServerClient()

      const { data, error } = await supabase
        .from("followup_templates")
        .select("*")
        .eq("is_active", true)
        .order("attempt_stage", { ascending: true })

      if (error) {
        console.error("[Templates API] Erro ao buscar templates:", error)
        
        // Se a tabela não existe, retorna array vazio
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return NextResponse.json({
            success: true,
            data: [],
            message: "Tabela de templates não encontrada. Execute a migration primeiro."
          })
        }
        
        throw error
      }

      return NextResponse.json({
        success: true,
        data: data || []
      })
    }

    return NextResponse.json(
      { error: "Ação não reconhecida" },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("[Templates API] Erro:", error)
    return NextResponse.json(
      { 
        success: false,
        error: error?.message || "Erro ao buscar templates",
        data: [] // Retorna array vazio em caso de erro
      },
      { status: 500 }
    )
  }
}

/**
 * POST para testar templates ou criar/atualizar
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, templateId, nome, data, horario, observacoes, ...templateData } = body

    if (action === "testar_mensagem") {
      // Buscar template
      const supabase = createBiaSupabaseServerClient()
      
      const { data: template, error: fetchError } = await supabase
        .from("followup_templates")
        .select("*")
        .eq("id", templateId)
        .single()

      if (fetchError || !template) {
        return NextResponse.json(
          { error: "Template não encontrado" },
          { status: 404 }
        )
      }

      // Substituir variáveis no template
      let mensagem = template.template_text
      
      if (nome) mensagem = mensagem.replace(/{nome}/g, nome)
      if (data) mensagem = mensagem.replace(/{data}/g, data)
      if (horario) mensagem = mensagem.replace(/{horario}/g, horario)
      if (observacoes) mensagem = mensagem.replace(/{observacoes}/g, observacoes)

      // Limpar variáveis não substituídas
      mensagem = mensagem.replace(/{[^}]+}/g, "[não informado]")

      return NextResponse.json({
        success: true,
        data: {
          mensagem,
          template: template.name,
          attempt_stage: template.attempt_stage
        }
      })
    }

    if (action === "criar" || action === "atualizar") {
      const supabase = createBiaSupabaseServerClient()

      if (action === "criar") {
        const { data: newTemplate, error: createError } = await supabase
          .from("followup_templates")
          .insert({
            name: templateData.name,
            attempt_stage: templateData.attempt_stage,
            template_text: templateData.template_text,
            context_hints: templateData.context_hints || [],
            is_active: true
          })
          .select()
          .single()

        if (createError) throw createError

        return NextResponse.json({
          success: true,
          message: "Template criado com sucesso",
          data: newTemplate
        })
      }

      if (action === "atualizar") {
        const { data: updatedTemplate, error: updateError } = await supabase
          .from("followup_templates")
          .update({
            name: templateData.name,
            attempt_stage: templateData.attempt_stage,
            template_text: templateData.template_text,
            context_hints: templateData.context_hints || [],
            updated_at: new Date().toISOString()
          })
          .eq("id", templateId)
          .select()
          .single()

        if (updateError) throw updateError

        return NextResponse.json({
          success: true,
          message: "Template atualizado com sucesso",
          data: updatedTemplate
        })
      }
    }

    return NextResponse.json(
      { error: "Ação não reconhecida" },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("[Templates API] Erro:", error)
    
    // Se a tabela não existe, retorna erro informativo
    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      return NextResponse.json(
        { 
          success: false,
          error: "Tabela de templates não encontrada. Execute a migration primeiro."
        },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: error?.message || "Erro ao processar template"
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE para remover template
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const templateId = searchParams.get("id")

    if (!templateId) {
      return NextResponse.json(
        { error: "ID do template é obrigatório" },
        { status: 400 }
      )
    }

    const supabase = createBiaSupabaseServerClient()

    const { error } = await supabase
      .from("followup_templates")
      .delete()
      .eq("id", templateId)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: "Template removido com sucesso"
    })
  } catch (error: any) {
    console.error("[Templates API] Erro ao deletar:", error)
    return NextResponse.json(
      { 
        success: false,
        error: error?.message || "Erro ao remover template"
      },
      { status: 500 }
    )
  }
}
