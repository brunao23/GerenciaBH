-- ==========================================
-- CRON: FOLLOW-UP A CADA 10 MINUTOS
-- ==========================================

-- Habilite extensões necessárias (uma vez)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Agendar chamada HTTP para o endpoint de cron
SELECT cron.schedule(
  'followup_cron_10min',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://gerencia.vox.geniallabs.com.br/api/followup/cron',
      headers := jsonb_build_object('Authorization', 'Bearer tUSU7AkeKb5#=V9+')
    );
  $$
);
