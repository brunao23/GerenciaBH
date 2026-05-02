-- ============================================================
-- FIX: vox_maceio - Desabilitar coleta de email no agendamento
-- O campo collectEmailForScheduling=false faz o agente:
--   - NUNCA pedir email ao lead
--   - Ignorar se o lead oferecer email espontaneamente
--   - Agendar normalmente (sistema gera email interno automático)
-- ============================================================

-- 1. Verificar estado atual
SELECT
  unit_prefix,
  metadata->>'collectEmailForScheduling' AS collect_email_atual
FROM units_registry
WHERE unit_prefix = 'vox_maceio';

-- 2. Aplicar correção
UPDATE units_registry
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{collectEmailForScheduling}',
  'false'::jsonb
)
WHERE unit_prefix = 'vox_maceio';

-- 3. Verificar resultado
SELECT
  unit_prefix,
  metadata->>'collectEmailForScheduling' AS collect_email_apos_fix
FROM units_registry
WHERE unit_prefix = 'vox_maceio';
