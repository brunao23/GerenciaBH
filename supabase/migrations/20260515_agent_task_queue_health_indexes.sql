-- Lightweight indexes for task queue health checks and stale-processing recovery.

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_processing_updated_at
  ON public.agent_task_queue (updated_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_error_updated_at
  ON public.agent_task_queue (updated_at DESC)
  WHERE status = 'error';

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_done_executed_at
  ON public.agent_task_queue (executed_at DESC)
  WHERE status = 'done';
