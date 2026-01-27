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

// Cliente Supabase com service role (admin)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lista de migrations disponíveis
const MIGRATIONS = {
    'workflow-control': 'sql/workflow_control_tables.sql',
    'tabelas-empresa': 'sql/criar_tabelas_por_empresa.sql',
};

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

                // Executar SQL
                const { error } = await supabaseAdmin.rpc('exec_sql', {
                    sql_query: sqlContent
                });

                if (error) {
                    // Se a função exec_sql não existir, tentar executar diretamente
                    // Isso requer que o SQL seja executado em partes ou via outra abordagem
                    console.error(`Erro ao executar ${name}:`, error);
                    results.push({ name: name as string, success: false, error: error.message });
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
