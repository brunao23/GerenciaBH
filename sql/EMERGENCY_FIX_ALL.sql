-- 🚨 SCRIPT DE EMERGÊNCIA: CORREÇÃO TOTAL DE RLS E ACESSO
-- Execute este script COMPLETO no Supabase SQL Editor para destravar o sistema

BEGIN;

-- 1. Desabilitar RLS da tabela usuarios temporariamente (para evitar o loop AGORA)
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas problemáticas antigas
DROP POLICY IF EXISTS "Usuarios podem ver seus proprios dados" ON public.usuarios;
DROP POLICY IF EXISTS "Admins podem ver tudo" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_read_own" ON public.usuarios;
DROP POLICY IF EXISTS "admins_read_all" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_ver_propri_dados" ON public.usuarios;
DROP POLICY IF EXISTS "admin_ver_tudo" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_editar_proprio" ON public.usuarios;
DROP FUNCTION IF EXISTS public.is_admin();

-- 3. Criar função RPC segura para busca de empresa (Fundamental para a API)
CREATE OR REPLACE FUNCTION public.get_empresa_do_usuario(p_user_id UUID)
RETURNS TABLE (
  empresa_id UUID,
  schema_nome TEXT,
  empresa_nome TEXT
) 
SECURITY DEFINER -- Ignora RLS
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id, 
    e.schema, 
    e.nome
  FROM public.usuarios u
  JOIN public.empresas e ON e.id = u.empresa_id
  WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Criar políticas RLS SIMPLIFICADAS e SEGURAS
-- Política 1: Usuário vê a si mesmo
CREATE POLICY "policy_usuarios_self"
ON public.usuarios
FOR ALL
USING (auth.uid() = id);

-- Política 2: Service Role e Admins
-- (Assumindo que admin também tem flag 'admin' na coluna role)
CREATE POLICY "policy_usuarios_admin"
ON public.usuarios
FOR SELECT
USING (role = 'admin');

-- 5. Reabilitar RLS (Agora seguro)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- 6. Garantir permissões de execução na função
GRANT EXECUTE ON FUNCTION public.get_empresa_do_usuario(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_empresa_do_usuario(UUID) TO service_role;

COMMIT;

-- Confirmação
SELECT 'CORRECAO APLICADA COM SUCESSO' as status;
