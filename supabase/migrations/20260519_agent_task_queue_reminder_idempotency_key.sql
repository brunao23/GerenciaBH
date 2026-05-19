-- Prevent duplicate active generic reminder jobs, including post-schedule media.
-- Official appointment reminders keep their dedicated reminder_key index.

WITH ranked_active_idempotent_reminders AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, payload->>'idempotency_key'
      ORDER BY
        CASE status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        run_at ASC,
        created_at ASC,
        id ASC
    ) AS row_number
  FROM public.agent_task_queue
  WHERE task_type = 'reminder'
    AND status IN ('pending', 'processing')
    AND COALESCE(payload->>'idempotency_key', '') <> ''
)
UPDATE public.agent_task_queue AS queue
SET
  status = 'cancelled',
  last_error = 'cancelled_by_duplicate_active_idempotency_key',
  updated_at = NOW()
FROM ranked_active_idempotent_reminders AS ranked
WHERE queue.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_queue_active_reminder_idempotency_key
  ON public.agent_task_queue (tenant, ((payload->>'idempotency_key')))
  WHERE task_type = 'reminder'
    AND status IN ('pending', 'processing')
    AND COALESCE(payload->>'idempotency_key', '') <> '';
