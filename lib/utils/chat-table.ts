/**
 * Helper para obter o nome correto da tabela de chat histories
 * Suporta ambos os formatos:
 * - vox_bhn8n_chat_histories (sem underscore)
 * - vox_maceio_n8n_chat_histories (com underscore)
 */
export async function getChatTableName(tenant: string, supabase: any): Promise<string> {
    // Tentar primeiro sem underscore (padrão)
    const tableWithoutUnderscore = `${tenant}n8n_chat_histories`

    const { error } = await supabase
        .from(tableWithoutUnderscore)
        .select("id")
        .limit(1)

    // Se não der erro, a tabela existe
    if (!error) {
        return tableWithoutUnderscore
    }

    // Se der erro de tabela não existe, tentar com underscore
    if (error.message.includes('does not exist')) {
        return `${tenant}_n8n_chat_histories`
    }

    // Se for outro erro, retornar o padrão
    return tableWithoutUnderscore
}
