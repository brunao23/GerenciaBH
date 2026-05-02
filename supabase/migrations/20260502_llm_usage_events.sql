CREATE TABLE IF NOT EXISTS public.llm_usage_events (
  id BIGSERIAL PRIMARY KEY,
  tenant TEXT NOT NULL,
  session_id TEXT NOT NULL,
  message_id TEXT NULL,
  source TEXT NOT NULL DEFAULT 'native-agent',
  channel TEXT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  input_cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0,
  output_cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0,
  fx_rate_brl NUMERIC(14,8) NOT NULL DEFAULT 0,
  input_cost_brl NUMERIC(14,6) NOT NULL DEFAULT 0,
  output_cost_brl NUMERIC(14,6) NOT NULL DEFAULT 0,
  tools_cost_brl NUMERIC(14,6) NOT NULL DEFAULT 0,
  total_cost_brl NUMERIC(14,6) NOT NULL DEFAULT 0,
  tool_calls_count INTEGER NOT NULL DEFAULT 0,
  tool_executions_count INTEGER NOT NULL DEFAULT 0,
  tools_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing_source TEXT NULL,
  raw_usage JSONB NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_tenant_created_at
  ON public.llm_usage_events (tenant, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_created_at
  ON public.llm_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_provider_model
  ON public.llm_usage_events (provider, model);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_session
  ON public.llm_usage_events (session_id);
