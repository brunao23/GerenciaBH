/**
 * Script de teste: Envia mensagem via Native Agent 
 * usando o modelo Gemini 2.0 Flash para o tenant vox_sp (Berrini)
 * 
 * Uso: npx tsx scripts/test-agent-message.ts
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { createClient } from "@supabase/supabase-js"
import { GeminiService } from "../lib/services/gemini.service"

const TENANT = "vox_sp"
const PHONE = "5522992523549"
const TEST_MESSAGE = "Olá, gostaria de saber mais sobre os cursos disponíveis."
const FORCE_MODEL = "gemini-2.0-flash"

async function main() {
  console.log("=== TESTE DE AGENTE NATIVO ===")
  console.log(`Tenant: ${TENANT}`)
  console.log(`Phone: ${PHONE}`)
  console.log(`Modelo forçado: ${FORCE_MODEL}`)
  console.log("")

  // 1. Buscar config do Supabase diretamente
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Supabase URL ou KEY não encontrados no .env.local")
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  
  // 2. Buscar metadata do tenant
  const { data, error } = await supabase
    .from("units_registry")
    .select("unit_prefix, metadata")
    .ilike("unit_prefix", `%${TENANT.replace('vox_', '')}%`)
    .limit(5)

  console.log(`📊 Busca no units_registry:`)
  if (error) {
    console.error(`   ❌ Erro: ${error.message}`)
    
    // Tentar listar todos os tenants
    const { data: allUnits } = await supabase
      .from("units_registry")
      .select("unit_prefix")
      .limit(20)
    
    if (allUnits) {
      console.log(`   Tenants disponíveis: ${allUnits.map(u => u.unit_prefix).join(', ')}`)
    }
    return
  }
  
  if (!data || data.length === 0) {
    // Tentar buscar todos
    const { data: allUnits } = await supabase
      .from("units_registry")
      .select("unit_prefix")
      .limit(20)
    
    console.log(`   ❌ Tenant '${TENANT}' não encontrado`)
    if (allUnits) {
      console.log(`   Tenants disponíveis: ${allUnits.map(u => u.unit_prefix).join(', ')}`)
    }
    return
  }

  const unit = data[0]
  const metadata = unit?.metadata || {}
  const nativeAgent = metadata?.nativeAgent || metadata?.aiAgent || {}
  const messaging = metadata?.messaging || {}
  
  console.log(`   ✅ Tenant encontrado: ${unit.unit_prefix}`)
  console.log(`   Provider: ${nativeAgent.aiProvider || 'google'}`)
  console.log(`   Modelo: ${nativeAgent.geminiModel || 'default'}`)
  console.log(`   API Key presente: ${nativeAgent.geminiApiKey ? 'SIM' : 'NÃO'}`)
  console.log(`   Messaging sendTextUrl: ${messaging.sendTextUrl ? 'SIM' : 'NÃO'}`)
  console.log("")

  // 3. Resolver API Key
  const apiKey = nativeAgent.geminiApiKey || process.env.GEMINI_API_KEY || ""
  if (!apiKey) {
    console.error("❌ Sem API key do Gemini no tenant nem no env!")
    return
  }

  // 4. Criar GeminiService com modelo forçado
  console.log(`🔧 Criando GeminiService com modelo: ${FORCE_MODEL}`)
  const llm = new GeminiService(apiKey, FORCE_MODEL)

  // 5. Fazer chamada
  console.log(`🤖 Chamando LLM...`)
  const startTime = Date.now()
  
  try {
    const decision = await llm.decideNextTurn({
      systemPrompt: `Você é a assistente virtual da Vox2You Berrini (unidade São Paulo). Responda de forma consultiva e acolhedora.
Responda em português do Brasil. Seja breve e direta.
Esta é uma mensagem de teste do sistema. Responda normalmente como se fosse um lead real.`,
      conversation: [
        { role: "user", content: TEST_MESSAGE },
      ],
    })

    const elapsed = Date.now() - startTime
    console.log(`✅ Resposta recebida em ${elapsed}ms`)
    console.log("")
    console.log("--- RESPOSTA DO LLM ---")
    console.log(decision.reply)
    console.log("--- FIM ---")
    console.log("")
    console.log(`Actions: ${JSON.stringify(decision.actions)}`)
    console.log(`Handoff: ${decision.handoff}`)
    console.log("")

    // 6. Enviar via Z-API/WhatsApp
    if (decision.reply && messaging.sendTextUrl) {
      console.log(`📱 Enviando mensagem para ${PHONE} via Z-API...`)
      
      const sendUrl = String(messaging.sendTextUrl || "").replace("{phone}", PHONE)
      const token = messaging.token || ""
      
      const sendPayload = {
        phone: PHONE,
        message: `[TESTE - Modelo: ${FORCE_MODEL}]\n\n${decision.reply}`,
      }

      const sendResponse = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Client-Token": token } : {}),
        },
        body: JSON.stringify(sendPayload),
      })

      const sendResult = await sendResponse.text()
      
      if (sendResponse.ok) {
        console.log(`✅ Mensagem enviada com sucesso!`)
        console.log(`   Status: ${sendResponse.status}`)
        try {
          const parsed = JSON.parse(sendResult)
          console.log(`   Response: ${JSON.stringify(parsed).substring(0, 200)}`)
        } catch {
          console.log(`   Response: ${sendResult.substring(0, 200)}`)
        }
      } else {
        console.error(`❌ Falha ao enviar: ${sendResponse.status}`)
        console.error(`   ${sendResult.substring(0, 300)}`)
      }
    } else if (decision.reply) {
      console.log(`⚠️ Resposta gerada, mas sem sendTextUrl configurado para enviar.`)
      console.log(`   Resposta: ${decision.reply.substring(0, 200)}...`)
    } else {
      console.warn("⚠️ Resposta vazia do LLM.")
    }

  } catch (error: any) {
    const elapsed = Date.now() - startTime
    console.error(`❌ Erro após ${elapsed}ms:`, error.message)
  }

  console.log("")
  console.log("=== FIM DO TESTE ===")
}

main().catch(console.error)
