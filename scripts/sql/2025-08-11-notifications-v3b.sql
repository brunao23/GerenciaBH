-- Torna idempotente a constraint do tipo de notificação.
-- Se a constraint existir e já contiver 'victory', não faz nada.
-- Se existir e não contiver 'victory', remove e recria.
-- Se não existir, cria.

do $$
declare
  condef text;
begin
  select pg_get_constraintdef(c.oid)
    into condef
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'notifications'
    and c.contype = 'c'
    and c.conname = 'notifications_type_check';

  if condef is null then
    -- não existe: cria
    execute $$alter table public.notifications
             add constraint notifications_type_check
             check (type in ('message','error','agendamento','followup','victory'))$$;
  elsif position('victory' in condef) > 0 then
    -- já está correta: nada a fazer
    null;
  else
    -- existe, mas sem 'victory': drop e add
    execute $$alter table public.notifications
             drop constraint notifications_type_check$$;
    execute $$alter table public.notifications
             add constraint notifications_type_check
             check (type in ('message','error','agendamento','followup','victory'))$$;
  end if;
end$$;
