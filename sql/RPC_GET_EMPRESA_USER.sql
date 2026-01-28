-- 🚨 RPC SEGURA PARA BUSCAR EMPRESA DO USUÁRIO
-- Evita erro de recursão infinita RLS ao usar SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.get_empresa_do_usuario(p_user_id UUID)
RETURNS TABLE (
  empresa_id UUID,
  schema_nome TEXT,
  empresa_nome TEXT
) 
SECURITY DEFINER -- Roda como superusuário, ignora RLS da tabela usuarios
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
