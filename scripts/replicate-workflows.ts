#!/usr/bin/env tsx
/**
 * Script CLI para replicar workflows
 * 
 * Uso:
 *   npm run replicate-workflows -- --empresa-id=<UUID> [--dry-run]
 *   
 * Exemplos:
 *   npm run replicate-workflows -- --empresa-id=123e4567-e89b-12d3-a456-426614174000
 *   npm run replicate-workflows -- --empresa-id=123e4567-e89b-12d3-a456-426614174000 --dry-run
 */

import { workflowReplicator } from '../lib/n8n';
import { ReplicationConfig } from '../types/n8n';
import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Variáveis de ambiente não configuradas:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL');
    console.error('   SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Parse argumentos da linha de comando
 */
function parseArgs(): { empresaId?: string; dryRun: boolean } {
    const args = process.argv.slice(2);
    const result: { empresaId?: string; dryRun: boolean } = {
        dryRun: false,
    };

    for (const arg of args) {
        if (arg.startsWith('--empresa-id=')) {
            result.empresaId = arg.split('=')[1];
        } else if (arg === '--dry-run') {
            result.dryRun = true;
        }
    }

    return result;
}

/**
 * Buscar dados da empresa
 */
async function getEmpresaData(empresaId: string) {
    const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .single();

    if (error || !data) {
        throw new Error(`Empresa não encontrada: ${empresaId}`);
    }

    return data;
}

/**
 * Buscar credenciais da empresa
 */
async function getCredenciais(empresaId: string) {
    const { data, error } = await supabase
        .from('empresa_credenciais')
        .select('*')
        .eq('empresa_id', empresaId)
        .single();

    if (error || !data) {
        throw new Error(`Credenciais não encontradas para empresa: ${empresaId}`);
    }

    return data;
}

/**
 * Main
 */
async function main() {
    console.log('🚀 Script de Replicação de Workflows N8N\n');

    // Parse argumentos
    const { empresaId, dryRun } = parseArgs();

    if (!empresaId) {
        console.error('❌ Erro: --empresa-id é obrigatório\n');
        console.log('Uso:');
        console.log('  npm run replicate-workflows -- --empresa-id=<UUID> [--dry-run]\n');
        console.log('Exemplo:');
        console.log('  npm run replicate-workflows -- --empresa-id=123e4567-e89b-12d3-a456-426614174000\n');
        process.exit(1);
    }

    if (dryRun) {
        console.log('⚠️  Modo DRY RUN ativado - Nenhuma alteração será feita\n');
    }

    try {
        // 1. Buscar dados da empresa
        console.log('📋 Buscando dados da empresa...');
        const empresa = await getEmpresaData(empresaId);
        console.log(`   ✅ Empresa encontrada: ${empresa.nome}`);
        console.log(`   📦 Schema: ${empresa.schema}\n`);

        // 2. Buscar credenciais
        console.log('🔐 Buscando credenciais...');
        const credenciais = await getCredenciais(empresaId);
        console.log('   ✅ Credenciais encontradas\n');

        // 3. Montar configuração
        const config: ReplicationConfig = {
            empresaId: empresa.id,
            empresaNome: empresa.nome,
            schema: empresa.schema,
            credentials: {
                supabaseApiId: credenciais.supabase_api_id,
                supabaseApiName: credenciais.supabase_api_name,
                redisId: credenciais.redis_id,
                redisName: credenciais.redis_name,
                postgresId: credenciais.postgres_id,
                postgresName: credenciais.postgres_name,
                googleCalendarId: credenciais.google_calendar_id,
                googleCalendarName: credenciais.google_calendar_name,
                evolutionApiId: credenciais.evolution_api_id,
                evolutionApiName: credenciais.evolution_api_name,
            },
            webhookBaseUrl: credenciais.webhook_base_url,
            calendarEmail: credenciais.calendar_email,
            evolutionInstance: credenciais.evolution_instance,
            notificationGroup: credenciais.notification_group,
        };

        // 4. Dry Run - apenas mostrar configuração
        if (dryRun) {
            console.log('📝 Configuração que seria usada:\n');
            console.log(JSON.stringify(config, null, 2));
            console.log('\n✅ Dry run concluído. Nenhuma alteração foi feita.');
            process.exit(0);
        }

        // 5. Executar replicação
        console.log('🔄 Iniciando replicação de workflows...\n');
        const result = await workflowReplicator.replicateAll(config);

        // 6. Exibir resultados
        console.log('\n📊 RESULTADO DA REPLICAÇÃO:\n');
        console.log(`   Total de workflows: ${result.results.length}`);
        console.log(`   ✅ Sucesso: ${result.results.filter(r => r.success).length}`);
        console.log(`   ❌ Falhas: ${result.results.filter(r => !r.success).length}\n`);

        if (result.results.length > 0) {
            console.log('📋 Detalhes por workflow:\n');
            for (const r of result.results) {
                const icon = r.success ? '✅' : '❌';
                console.log(`   ${icon} ${r.workflowName}`);
                if (r.success && r.n8nWorkflowId) {
                    console.log(`      ID N8N: ${r.n8nWorkflowId}`);
                }
                if (!r.success && r.error) {
                    console.log(`      Erro: ${r.error}`);
                }
            }
        }

        // 7. Registrar no banco
        console.log('\n💾 Registrando resultado no banco...');
        await supabase.from('workflow_replications').insert({
            empresa_id: empresaId,
            success: result.success,
            workflows_created: result.results.filter(r => r.success).length,
            workflows_failed: result.results.filter(r => !r.success).length,
            results: result.results,
            errors: result.errors,
        });
        console.log('   ✅ Registro salvo\n');

        // 8. Status final
        if (result.success) {
            console.log('✅ REPLICAÇÃO CONCLUÍDA COM SUCESSO!\n');
            process.exit(0);
        } else {
            console.log('⚠️  REPLICAÇÃO CONCLUÍDA COM ERROS\n');
            console.log('Erros:');
            for (const error of result.errors) {
                console.log(`   - ${error}`);
            }
            process.exit(1);
        }

    } catch (error: any) {
        console.error('\n❌ ERRO FATAL:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Executar
main();
