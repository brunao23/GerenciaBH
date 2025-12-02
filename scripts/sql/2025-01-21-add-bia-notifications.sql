-- Criar triggers de notificação específicos para as tabelas da Bia Fox
-- MANTENDO os triggers da Sofia intactos

-- Função para notificações da Bia Fox
CREATE OR REPLACE FUNCTION notify_bia_changes()
RETURNS trigger AS $$
DECLARE
    notification_data jsonb;
    message_content text;
    session_id_val text;
    contact_number text;
BEGIN
    -- Extrair dados da mensagem para Bia Fox
    IF TG_TABLE_NAME = 'bia_voxn8n_chat_histories' THEN
        session_id_val := NEW.session_id;
        
        -- Extrair conteúdo da mensagem do JSONB
        IF NEW.message ? 'text' THEN
            message_content := NEW.message->>'text';
        ELSIF NEW.message ? 'content' THEN
            message_content := NEW.message->>'content';
        ELSE
            message_content := 'Nova mensagem';
        END IF;
        
        -- Extrair número de contato do session_id (formato esperado: número@...)
        contact_number := split_part(session_id_val, '@', 1);
        
        -- Limitar tamanho da mensagem
        IF length(message_content) > 200 THEN
            message_content := left(message_content, 200) || '...';
        END IF;
        
        -- Criar dados da notificação
        notification_data := jsonb_build_object(
            'id', gen_random_uuid(),
            'type', 'message',
            'title', 'Nova mensagem - Bia Fox',
            'description', message_content,
            'source_table', 'bia_voxn8n_chat_histories',
            'source_id', NEW.id::text,
            'session_id', session_id_val,
            'numero', contact_number,
            'created_at', now(),
            'read', false
        );
        
    ELSIF TG_TABLE_NAME = 'bia_vox_agendamentos' THEN
        -- Notificação para novos agendamentos da Bia Fox
        notification_data := jsonb_build_object(
            'id', gen_random_uuid(),
            'type', 'agendamento',
            'title', 'Novo agendamento - Bia Fox',
            'description', 'Agendamento para ' || COALESCE(NEW.nome, 'Cliente') || ' em ' || COALESCE(NEW.dia, 'data não especificada'),
            'source_table', 'bia_vox_agendamentos',
            'source_id', NEW.id::text,
            'session_id', NULL,
            'numero', NEW.contato,
            'created_at', now(),
            'read', false
        );
        
    ELSIF TG_TABLE_NAME = 'bia_vox_folow_normal' THEN
        -- Notificação para follow-ups da Bia Fox
        notification_data := jsonb_build_object(
            'id', gen_random_uuid(),
            'type', 'followup',
            'title', 'Follow-up atualizado - Bia Fox',
            'description', 'Follow-up atualizado para contato ' || COALESCE(NEW.numero, 'não identificado'),
            'source_table', 'bia_vox_folow_normal',
            'source_id', NEW.id::text,
            'session_id', NULL,
            'numero', NEW.numero,
            'created_at', now(),
            'read', false
        );
    END IF;
    
    -- Corrigindo inserção para usar colunas corretas da tabela bia_vox_notifications
    -- Inserir na tabela de notificações da Bia Fox usando apenas colunas que existem
    INSERT INTO bia_vox_notifications (
        id, type, title, description, source_table, source_id, 
        session_id, numero, created_at, read
    ) VALUES (
        (notification_data->>'id')::uuid,
        notification_data->>'type',
        notification_data->>'title',
        notification_data->>'description',
        notification_data->>'source_table',
        notification_data->>'source_id',
        notification_data->>'session_id',
        notification_data->>'numero',
        (notification_data->>'created_at')::timestamptz,
        (notification_data->>'read')::boolean
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para as tabelas da Bia Fox (SEM remover os da Sofia)

-- Trigger para mensagens da Bia Fox
DROP TRIGGER IF EXISTS bia_chat_notification_trigger ON public.bia_voxn8n_chat_histories;
CREATE TRIGGER bia_chat_notification_trigger
    AFTER INSERT ON public.bia_voxn8n_chat_histories
    FOR EACH ROW
    EXECUTE FUNCTION notify_bia_changes();

-- Trigger para agendamentos da Bia Fox
DROP TRIGGER IF EXISTS bia_agendamentos_notification_trigger ON public.bia_vox_agendamentos;
CREATE TRIGGER bia_agendamentos_notification_trigger
    AFTER INSERT OR UPDATE ON public.bia_vox_agendamentos
    FOR EACH ROW
    EXECUTE FUNCTION notify_bia_changes();

-- Trigger para follow-ups da Bia Fox
DROP TRIGGER IF EXISTS bia_followup_notification_trigger ON public.bia_vox_folow_normal;
CREATE TRIGGER bia_followup_notification_trigger
    AFTER INSERT OR UPDATE ON public.bia_vox_folow_normal
    FOR EACH ROW
    EXECUTE FUNCTION notify_bia_changes();

-- Comentário explicativo
COMMENT ON FUNCTION notify_bia_changes() IS 'Função para gerar notificações específicas das tabelas da Bia Fox, mantendo as notificações da Sofia intactas';
