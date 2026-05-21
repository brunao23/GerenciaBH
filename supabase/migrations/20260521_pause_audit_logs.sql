CREATE TABLE IF NOT EXISTS public.pause_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant TEXT NOT NULL,
  phone TEXT NOT NULL,
  session_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('pause', 'unpause', 'delete', 'update')),
  previous_paused BOOLEAN,
  new_paused BOOLEAN,
  pause_reason TEXT,
  paused_until TIMESTAMPTZ,
  actor_role TEXT,
  actor_name TEXT,
  actor_user_id TEXT,
  actor_unit TEXT,
  actor_source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pause_audit_logs_tenant_created
  ON public.pause_audit_logs (tenant, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pause_audit_logs_tenant_phone_created
  ON public.pause_audit_logs (tenant, phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pause_audit_logs_action_created
  ON public.pause_audit_logs (action, created_at DESC);
