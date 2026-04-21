-- Semantic cache for native agent responses
-- Requires pgvector extension (enable in Supabase dashboard: Database > Extensions > vector)
-- Safe to run multiple times (idempotent)

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.semantic_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant        TEXT NOT NULL,
  message_hash  TEXT NOT NULL,
  message_normalized TEXT NOT NULL,
  embedding     vector(768),
  response_text TEXT NOT NULL,
  has_tool_calls BOOLEAN NOT NULL DEFAULT FALSE,
  category      TEXT,
  hit_count     INTEGER NOT NULL DEFAULT 0,
  last_hit_at   TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at    TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Backfill: add columns that may be missing from older schema versions
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
ALTER TABLE public.semantic_cache ADD COLUMN IF NOT EXISTS last_hit_at TIMESTAMPTZ;

-- ─── Indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_semantic_cache_tenant_hash
  ON public.semantic_cache (tenant, message_hash)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_semantic_cache_expires
  ON public.semantic_cache (expires_at)
  WHERE is_active = TRUE AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semantic_cache_tenant_active
  ON public.semantic_cache (tenant, created_at DESC)
  WHERE is_active = TRUE;

-- HNSW index for fast approximate nearest-neighbor search on embeddings
-- NOTE: requires at least a few hundred rows to be effective
CREATE INDEX IF NOT EXISTS idx_semantic_cache_embedding
  ON public.semantic_cache
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Updated_at trigger ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.semantic_cache_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_semantic_cache_updated_at ON public.semantic_cache;
CREATE TRIGGER trg_semantic_cache_updated_at
  BEFORE UPDATE ON public.semantic_cache
  FOR EACH ROW EXECUTE FUNCTION public.semantic_cache_set_updated_at();

-- ─── RPC: vector similarity search ───────────────────────────────

CREATE OR REPLACE FUNCTION public.match_semantic_cache(
  query_embedding   vector(768),
  query_tenant      TEXT,
  similarity_threshold FLOAT DEFAULT 0.82,
  match_limit       INT DEFAULT 1
)
RETURNS TABLE (
  id             UUID,
  response_text  TEXT,
  category       TEXT,
  has_tool_calls BOOLEAN,
  similarity     FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    response_text,
    category,
    has_tool_calls,
    (1 - (embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.semantic_cache
  WHERE
    tenant = query_tenant
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
    AND 1 - (embedding <=> query_embedding) >= similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_limit;
$$;

-- ─── RPC: record cache hit ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.semantic_cache_record_hit(cache_id UUID)
RETURNS VOID LANGUAGE sql AS $$
  UPDATE public.semantic_cache
  SET hit_count = hit_count + 1,
      last_hit_at = NOW(),
      updated_at = NOW()
  WHERE id = cache_id;
$$;

-- ─── RPC: cleanup expired entries ────────────────────────────────

CREATE OR REPLACE FUNCTION public.semantic_cache_cleanup_expired()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.semantic_cache
  WHERE is_active = TRUE
    AND expires_at IS NOT NULL
    AND expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ─── RLS: service role only (no anon access) ──────────────────────

ALTER TABLE public.semantic_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS semantic_cache_service_only ON public.semantic_cache;
CREATE POLICY semantic_cache_service_only
  ON public.semantic_cache
  USING (auth.role() = 'service_role');
