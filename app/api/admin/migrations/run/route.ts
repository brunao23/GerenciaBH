/**
 * API: Executar Migrations SQL
 * POST /api/admin/migrations/run
 * 
 * Executa os scripts SQL para configurar o banco de dados
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

// Cliente Supabase com service role (admin)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lista de migrations disponíveis
const MIGRATIONS = {
    'workflow-control': 'sql/workflow_control_tables.sql',
    'tabelas-empresa': 'sql/criar_tabelas_por_empresa.sql',
    'semantic-cache-embedding-nullable': 'supabase/migrations/20260428_semantic_cache_embedding_nullable.sql',
};

function resolveProjectRefFromSupabaseUrl(rawUrl?: string | null): string | null {
    const text = String(rawUrl || '').trim();
    if (!text) return null;
    try {
        const host = new URL(text).hostname;
        const ref = host.split('.')[0];
        return ref || null;
    } catch {
        return null;
    }
}

async function executeSqlViaDirectPg(sqlContent: string, dbPassword: string): Promise<void> {
    const projectRef = resolveProjectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
    if (!projectRef) {
        throw new Error('Não foi possível resolver project_ref a partir da URL do Supabase.');
    }

    const regions = [
        'sa-east-1',
        'us-east-1',
        'us-east-2',
        'us-west-1',
        'us-west-2',
        'eu-west-1',
        'eu-west-2',
        'eu-west-3',
        'eu-central-1',
        'eu-north-1',
        'ap-south-1',
        'ap-northeast-1',
        'ap-northeast-2',
        'ap-southeast-1',
        'ap-southeast-2',
        'ca-central-1',
    ];

    const candidates: Array<{ host: string; port: number; user: string; label: string }> = [
        { host: `db.${projectRef}.supabase.co`, port: 5432, user: 'postgres', label: 'direct' },
    ];

    for (const region of regions) {
        for (const prefix of ['aws-0', 'aws-1']) {
            const host = `${prefix}-${region}.pooler.supabase.com`;
            candidates.push({
                host,
                port: 6543,
                user: `postgres.${projectRef}`,
                label: `pooler/${prefix}/${region}/scoped`,
            });
            candidates.push({
                host,
                port: 6543,
                user: 'postgres',
                label: `pooler/${prefix}/${region}/postgres`,
            });
        }
    }

    const errors: string[] = [];
    for (const candidate of candidates) {
        const client = new Client({
            host: candidate.host,
            port: candidate.port,
            user: candidate.user,
            password: dbPassword,
            database: 'postgres',
            ssl: {
                rejectUnauthorized: false,
                servername: `db.${projectRef}.supabase.co`,
            },
            connectionTimeoutMillis: 4000,
            statement_timeout: 120000,
            query_timeout: 120000,
        });

        try {
            await client.connect();
            await client.query(sqlContent);
            await client.end().catch(() => { });
            return;
        } catch (error: any) {
            errors.push(`${candidate.label}: ${error?.message || 'erro_desconhecido'}`);
            await client.end().catch(() => { });
        }
    }

    throw new Error(`all_connection_candidates_failed -> ${errors.slice(0, 6).join(' | ')}`);
}

export async function POST(req: NextRequest) {
    try {
        // 1. Verificar autenticação (header especial para segurança)
        const authHeader = req.headers.get('x-admin-key');
        const adminKey = process.env.ADMIN_MIGRATION_KEY || 'super-secret-migration-key';

        if (authHeader !== adminKey) {
            return NextResponse.json(
                { error: 'Não autorizado. Forneça x-admin-key válido.' },
                { status: 401 }
            );
        }

        // 2. Obter qual migration executar
        const body = await req.json();
        const { migration, all } = body;
        const dbPasswordBody = typeof body?.dbPassword === 'string' ? body.dbPassword.trim() : '';
        const dbPasswordEnv = String(process.env.SUPABASE_DB_PASSWORD || '').trim();
        const directPgPassword = dbPasswordBody || dbPasswordEnv;

        if (!migration && !all) {
            return NextResponse.json({
                error: 'Especifique "migration" ou "all: true"',
                available: Object.keys(MIGRATIONS),
            }, { status: 400 });
        }

        const results: Array<{ name: string; success: boolean; error?: string }> = [];

        // 3. Determinar quais migrations executar
        const migrationsToRun = all
            ? Object.entries(MIGRATIONS)
            : [[migration, MIGRATIONS[migration as keyof typeof MIGRATIONS]]];

        // 4. Executar migrations
        for (const [name, filepath] of migrationsToRun) {
            if (!filepath) {
                results.push({ name: name as string, success: false, error: 'Migration não encontrada' });
                continue;
            }

            try {
                console.log(`🔄 Executando migration: ${name}`);

                // Ler arquivo SQL
                const sqlPath = path.join(process.cwd(), filepath as string);
                const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

                // Executar SQL via RPC padrão
                const { error } = await supabaseAdmin.rpc('exec_sql', {
                    sql_query: sqlContent
                });

                if (error) {
                    // Fallback: conexão direta com Postgres (quando exec_sql não existe)
                    if (directPgPassword) {
                        try {
                            await executeSqlViaDirectPg(sqlContent, directPgPassword);
                            console.log(`✅ Migration ${name} executada com fallback PG direto`);
                            results.push({ name: name as string, success: true });
                        } catch (fallbackError: any) {
                            console.error(`Erro ao executar ${name} via fallback PG:`, fallbackError);
                            results.push({
                                name: name as string,
                                success: false,
                                error: `exec_sql: ${error.message}; fallback_pg: ${fallbackError?.message || 'erro_desconhecido'}`,
                            });
                        }
                    } else {
                        console.error(`Erro ao executar ${name}:`, error);
                        results.push({
                            name: name as string,
                            success: false,
                            error: `${error.message} (fallback PG indisponível: informe dbPassword no body ou configure SUPABASE_DB_PASSWORD)`,
                        });
                    }
                } else {
                    console.log(`✅ Migration ${name} executada com sucesso`);
                    results.push({ name: name as string, success: true });
                }
            } catch (err: any) {
                console.error(`❌ Erro em ${name}:`, err);
                results.push({ name: name as string, success: false, error: err.message });
            }
        }

        // 5. Retornar resultado
        const successCount = results.filter(r => r.success).length;
        const totalCount = results.length;

        return NextResponse.json({
            success: successCount === totalCount,
            message: `${successCount}/${totalCount} migrations executadas`,
            results,
        });

    } catch (error: any) {
        console.error('❌ Erro ao executar migrations:', error);
        return NextResponse.json(
            { error: 'Erro ao executar migrations', details: error.message },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    // Listar migrations disponíveis
    return NextResponse.json({
        available: Object.keys(MIGRATIONS),
        instructions: {
            execute_one: 'POST /api/admin/migrations/run { "migration": "workflow-control" }',
            execute_all: 'POST /api/admin/migrations/run { "all": true }',
            header: 'x-admin-key: <sua-chave>',
        },
    });
}
