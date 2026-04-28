-- ============================================
-- SEMANTIC CACHE — Cache semantico para agentes nativos
-- Usa pgvector para busca por similaridade
-- ============================================

-- Habilitar pgvector (ja disponivel no Supabase por padrao)
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela principal do cache semantico (multi-tenant via coluna tenant)
CREATE TABLE IF NOT EXISTS public.semantic_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  message_normalized TEXT NOT NULL,
  embedding vector(768),
  response_text TEXT NOT NULL,
  has_tool_calls BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Index vetorial IVFFlat para busca por similaridade rapida
CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding
  ON public.semantic_cache
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Index para filtro por tenant + ativo
CREATE INDEX IF NOT EXISTS idx_semantic_cache_tenant_active
  ON public.semantic_cache (tenant, is_active)
  WHERE is_active = true;

-- Index para dedup exato por hash
CREATE INDEX IF NOT EXISTS idx_semantic_cache_hash
  ON public.semantic_cache (tenant, message_hash);

-- Index para limpeza por expiracao
CREATE INDEX IF NOT EXISTS idx_semantic_cache_expires
  ON public.semantic_cache (expires_at)
  WHERE expires_at IS NOT NULL AND is_active = true;

-- RPC para busca vetorial com threshold de similaridade
CREATE OR REPLACE FUNCTION public.match_semantic_cache(
  query_embedding vector(768),
  query_tenant TEXT,
  similarity_threshold FLOAT DEFAULT 0.92,
  match_limit INT DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  tenant TEXT,
  message_normalized TEXT,
  response_text TEXT,
  has_tool_calls BOOLEAN,
  category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.tenant,
    sc.message_normalized,
    sc.response_text,
    sc.has_tool_calls,
    sc.category,
    (1 - (sc.embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.semantic_cache sc
  WHERE sc.tenant = query_tenant
    AND sc.is_active = true
    AND sc.embedding IS NOT NULL
    AND (sc.expires_at IS NULL OR sc.expires_at > NOW())
    AND (1 - (sc.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- RPC para incrementar hit_count ao servir do cache
CREATE OR REPLACE FUNCTION public.semantic_cache_record_hit(cache_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.semantic_cache
  SET hit_count = hit_count + 1,
      last_hit_at = NOW()
  WHERE id = cache_id;
END;
$$;

-- RPC para limpeza de entradas expiradas
CREATE OR REPLACE FUNCTION public.semantic_cache_cleanup_expired()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.semantic_cache
  WHERE is_active = true
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- RLS
ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;

-- Politica: service_role tem acesso total
CREATE POLICY "semantic_cache_service_role_policy"
  ON public.semantic_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.semantic_cache IS 'Cache semantico para respostas dos agentes nativos. Usa pgvector para busca por similaridade.';
COMMENT ON COLUMN public.semantic_cache.embedding IS 'Vetor 768-dim gerado pelo Gemini text-embedding-004';
COMMENT ON COLUMN public.semantic_cache.message_hash IS 'SHA-256 da mensagem normalizada para dedup exato';
COMMENT ON COLUMN public.semantic_cache.category IS 'Categoria da mensagem: price, location, hours, faq, objection, general';
