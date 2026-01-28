-- 🚨 FIX CRÍTICO: RECURSÃO INFINITA EM RLS
-- Esse script remove as políticas recursivas da tabela usuarios e cria uma versão segura.

BEGIN;

-- 1. Desabilitar RLS temporariamente para limpar (opcional, mas seguro)
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;

-- 2. Remover TODAS as políticas existentes da tabela usuarios para começar do zero
DROP POLICY IF EXISTS "Usuarios podem ver seus proprios dados" ON public.usuarios;
DROP POLICY IF EXISTS "Admins podem ver tudo" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_read_own" ON public.usuarios;
DROP POLICY IF EXISTS "admins_read_all" ON public.usuarios;

-- 3. Criar política simples: Usuário vê seu próprio dado (SEM RECURSÃO)
CREATE POLICY "usuarios_ver_propri_dados"
ON public.usuarios
FOR SELECT
USING (auth.uid() = id);

-- 4. Função auxiliar segura para checar admin (evita recursão na policy)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER roda como superusuário, ignorando RLS

-- 5. Criar política para Admin ver tudo (usando a função segura)
CREATE POLICY "admin_ver_tudo"
ON public.usuarios
FOR ALL
USING (public.is_admin());

-- 6. Criar política para atualização de perfil (usuário edita a si mesmo)
CREATE POLICY "usuarios_editar_proprio"
ON public.usuarios
FOR UPDATE
USING (auth.uid() = id);

-- 7. Reabilitar RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verifica se resolveu
SELECT * FROM public.usuarios LIMIT 5;
