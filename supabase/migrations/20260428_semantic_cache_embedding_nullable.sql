-- Semantic cache compatibility patch:
-- 1) allow hash-only cache entries when embedding generation fails
-- 2) keep vector RPC safe by ignoring rows without embedding

ALTER TABLE public.semantic_cache
  ALTER COLUMN embedding DROP NOT NULL;

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
    AND embedding IS NOT NULL
    AND (expires_at IS NULL OR expires_at > NOW())
    AND 1 - (embedding <=> query_embedding) >= similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_limit;
$$;
