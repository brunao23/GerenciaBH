
import { N8nClient } from './lib/n8n/client';

async function testarConexao() {
    console.log('🔄 Testando conexão com N8N...');

    const client = new N8nClient();
    console.log(`📡 URL: ${process.env.N8N_API_URL}`);
    console.log(`🔑 Key configurada: ${!!process.env.N8N_API_KEY}`);

    try {
        const start = Date.now();
        const result = await client.listWorkflows();
        const duration = Date.now() - start;

        if (result.success) {
            console.log(`✅ SUCESSO! Conexão estabelecida em ${duration}ms`);
            console.log(`📊 Total de workflows encontrados: ${result.data.length || 0}`);

            if (result.data.length > 0) {
                console.log(`📝 Exemplo: ${result.data[0].name} (ID: ${result.data[0].id})`);
            }
        } else {
            console.error('❌ FALHA NA CONEXÃO:');
            console.error(result.error);
        }
    } catch (error) {
        console.error('❌ ERRO CRÍTICO:', error);
    }
}

testarConexao();
