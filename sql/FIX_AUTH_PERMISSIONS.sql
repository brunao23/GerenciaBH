-- 🚨 RECUPERAR ACESSO ADMIN E AUTOMATIZAR CADASTROS
-- Execute este script no SQL Editor do Supabase IMEDIATAMENTE

-- 1. Cria Trigger para novos usuários (Sign Up)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome, role, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    'user', -- Padrão: user. Mude manualmente para admin se precisar.
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      nome = EXCLUDED.nome,
      avatar_url = EXCLUDED.avatar_url;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove anterior se existir
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Aplica o trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. SINCRONIZAR usuários existentes (que já estavam no Auth)
INSERT INTO public.usuarios (id, email, nome, role, created_at)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'full_name', email),
  'user',
  created_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. DAR PERMISSÃO DE ADMIN
-- ATENÇÃO: Isso dará admin para TODOS os usuários atuais para evitar bloqueio.
UPDATE public.usuarios
SET role = 'admin';

-- Confirmação
SELECT id, email, role FROM public.usuarios;
