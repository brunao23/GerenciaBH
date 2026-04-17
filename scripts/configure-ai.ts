import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Erro: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados no .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function configureAI() {
  const args = process.argv.slice(2);
  const tenant = args[0]; // e.g., vox_bh
  const provider = args[1]; // google, anthropic, openrouter
  const model = args[2]; // e.g., claude-3-opus-20240229
  const apiKey = args[3]; // Opcional, se não quiser usar a do .env

  if (!tenant || !provider) {
    console.log("Uso: npx tsx scripts/configure-ai.ts <tenant> <provider> [model] [apiKey]");
    console.log("Providers: google, anthropic, openrouter");
    process.exit(0);
  }

  console.log(`Configurando AI para o tenant: ${tenant}...`);

  // O projeto armazena a config do agente dentro da coluna 'metadata' da units_registry
  const { data: unit, error: unitError } = await supabase
    .from("units_registry")
    .select("id, prefix, metadata")
    .eq("prefix", tenant)
    .single();

  if (unitError || !unit) {
    console.error(`Erro: Tenant ${tenant} não encontrado na units_registry.`);
    process.exit(1);
  }

  const metadata = unit.metadata || {};
  const nativeAgent = metadata.nativeAgent || {};

  // Atualizar provedor e campos relacionados
  nativeAgent.aiProvider = provider;
  
  if (model) {
    if (provider === "google") nativeAgent.geminiModel = model;
    if (provider === "anthropic") nativeAgent.anthropicModel = model;
    if (provider === "openrouter") nativeAgent.openRouterModel = model;
  }

  if (apiKey) {
    if (provider === "google") nativeAgent.geminiApiKey = apiKey;
    if (provider === "anthropic") nativeAgent.anthropicApiKey = apiKey;
    if (provider === "openrouter") nativeAgent.openRouterApiKey = apiKey;
  }

  const updatedMetadata = {
    ...metadata,
    nativeAgent: {
      ...nativeAgent,
      enabled: true,
      autoReplyEnabled: true
    }
  };

  const { error: updateError } = await supabase
    .from("units_registry")
    .update({ metadata: updatedMetadata })
    .eq("id", unit.id);

  if (updateError) {
    console.error(`Erro ao atualizar units_registry:`, updateError);
    process.exit(1);
  }

  console.log(`✅ Sucesso! Tenant ${tenant} configurado para usar ${provider}.`);
  console.log(`Modelo: ${model || "Padrão"}`);
}

configureAI().catch(console.error);
