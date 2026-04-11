-- Native Agent task queue (reminders and delayed actions)
CREATE TABLE IF NOT EXISTS public.agent_task_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant TEXT NOT NULL,
  session_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  executed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_pending
  ON public.agent_task_queue (status, run_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_tenant
  ON public.agent_task_queue (tenant, run_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_session
  ON public.agent_task_queue (session_id);

CREATE OR REPLACE FUNCTION public.agent_task_queue_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_task_queue_updated_at ON public.agent_task_queue;
CREATE TRIGGER trg_agent_task_queue_updated_at
BEFORE UPDATE ON public.agent_task_queue
FOR EACH ROW
EXECUTE FUNCTION public.agent_task_queue_set_updated_at();
