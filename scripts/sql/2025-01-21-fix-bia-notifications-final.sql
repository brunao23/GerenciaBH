-- CORREÇÃO DEFINITIVA: Remover triggers problemáticos e recriar corretamente
-- Este script resolve o erro "column 'contact' of relation 'bia_vox_notifications' does not exist"

-- 1. REMOVER TODOS OS TRIGGERS PROBLEMÁTICOS DA BIA FOX
DROP TRIGGER IF EXISTS bia_chat_notification_trigger ON public.bia_voxn8n_chat_histories;
DROP TRIGGER IF EXISTS bia_agendamentos_notification_trigger ON public.bia_vox_agendamentos;
DROP TRIGGER IF EXISTS bia_followup_notification_trigger ON public.bia_vox_folow_normal;

-- 2. REMOVER FUNÇÃO PROBLEMÁTICA
DROP FUNCTION IF EXISTS notify_bia_changes();

-- 3. RECRIAR FUNÇÃO CORRETA (sem referências à coluna 'contact')
CREATE OR REPLACE FUNCTION notify_bia_changes()
RETURNS trigger AS $$
DECLARE
    notification_id uuid;
    message_content text;
    session_id_val text;
    contact_number text;
BEGIN
    -- Gerar ID único para a notificação
    notification_id := gen_random_uuid();
    
    -- Processar diferentes tipos de tabela
    IF TG_TABLE_NAME = 'bia_voxn8n_chat_histories' THEN
        session_id_val := NEW.session_id;
        
        -- Extrair conteúdo da mensagem
        IF NEW.message ? 'text' THEN
            message_content := NEW.message->>'text';
        ELSIF NEW.message ? 'content' THEN
            message_content := NEW.message->>'content';
        ELSE
            message_content := 'Nova mensagem';
        END IF;
        
        -- Extrair número de contato
        contact_number := split_part(session_id_val, '@', 1);
        
        -- Limitar tamanho da mensagem
        IF length(message_content) > 200 THEN
            message_content := left(message_content, 200) || '...';
        END IF;
        
        -- Inserir notificação usando APENAS colunas que existem
        INSERT INTO bia_vox_notifications (
            id, type, title, description, source_table, source_id, 
            session_id, numero, created_at, read
        ) VALUES (
            notification_id,
            'message',
            'Nova mensagem - Bia Fox',
            message_content,
            'bia_voxn8n_chat_histories',
            NEW.id::text,
            session_id_val,
            contact_number,
            now(),
            false
        );
        
    ELSIF TG_TABLE_NAME = 'bia_vox_agendamentos' THEN
        -- Inserir notificação para agendamentos
        INSERT INTO bia_vox_notifications (
            id, type, title, description, source_table, source_id, 
            session_id, numero, created_at, read
        ) VALUES (
            notification_id,
            'agendamento',
            'Novo agendamento - Bia Fox',
            'Agendamento para ' || COALESCE(NEW.nome, 'Cliente') || ' em ' || COALESCE(NEW.dia, 'data não especificada'),
            'bia_vox_agendamentos',
            NEW.id::text,
            NULL,
            NEW.contato,
            now(),
            false
        );
        
    ELSIF TG_TABLE_NAME = 'bia_vox_folow_normal' THEN
        -- Inserir notificação para follow-ups
        INSERT INTO bia_vox_notifications (
            id, type, title, description, source_table, source_id, 
            session_id, numero, created_at, read
        ) VALUES (
            notification_id,
            'followup',
            'Follow-up atualizado - Bia Fox',
            'Follow-up atualizado para contato ' || COALESCE(NEW.numero, 'não identificado'),
            'bia_vox_folow_normal',
            NEW.id::text,
            NULL,
            NEW.numero,
            now(),
            false
        );
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Em caso de erro, não falhar a operação principal
        RAISE WARNING 'Erro ao criar notificação Bia Fox: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. RECRIAR TRIGGERS CORRETOS

-- Trigger para mensagens da Bia Fox
CREATE TRIGGER bia_chat_notification_trigger
    AFTER INSERT ON public.bia_voxn8n_chat_histories
    FOR EACH ROW
    EXECUTE FUNCTION notify_bia_changes();

-- Trigger para agendamentos da Bia Fox
CREATE TRIGGER bia_agendamentos_notification_trigger
    AFTER INSERT OR UPDATE ON public.bia_vox_agendamentos
    FOR EACH ROW
    EXECUTE FUNCTION notify_bia_changes();

-- Trigger para follow-ups da Bia Fox
CREATE TRIGGER bia_followup_notification_trigger
    AFTER INSERT OR UPDATE ON public.bia_vox_folow_normal
    FOR EACH ROW
    EXECUTE FUNCTION notify_bia_changes();

-- Comentário
COMMENT ON FUNCTION notify_bia_changes() IS 'Função corrigida para notificações da Bia Fox - sem referências à coluna contact inexistente';
