-- Hardens official appointment reminders against duplicate active queue rows.
-- The app still validates the live appointment before sending; this index prevents
-- two overlapping cron executions from creating the same active reminder.

WITH ranked_active_official_reminders AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant, payload->>'reminder_key'
      ORDER BY
        CASE status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        run_at ASC,
        created_at ASC,
        id ASC
    ) AS row_number
  FROM public.agent_task_queue
  WHERE task_type = 'reminder'
    AND status IN ('pending', 'processing')
    AND COALESCE(payload->>'reminder_key', '') <> ''
    AND payload->>'official_reminder' = 'true'
)
UPDATE public.agent_task_queue AS queue
SET
  status = 'cancelled',
  last_error = 'cancelled_by_duplicate_active_reminder_key',
  updated_at = NOW()
FROM ranked_active_official_reminders AS ranked
WHERE queue.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_queue_active_official_reminder_key
  ON public.agent_task_queue (tenant, ((payload->>'reminder_key')))
  WHERE task_type = 'reminder'
    AND status IN ('pending', 'processing')
    AND COALESCE(payload->>'reminder_key', '') <> ''
    AND payload->>'official_reminder' = 'true';

CREATE INDEX IF NOT EXISTS idx_agent_task_queue_done_official_reminder_key
  ON public.agent_task_queue (tenant, ((payload->>'reminder_key')), executed_at DESC)
  WHERE task_type = 'reminder'
    AND status = 'done'
    AND COALESCE(payload->>'reminder_key', '') <> ''
    AND payload->>'official_reminder' = 'true';
