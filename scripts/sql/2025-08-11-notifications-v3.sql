-- v3: adiciona o tipo 'victory', detecção de vitória, e publica notifications no Realtime

-- 0) Ensure extension unaccent (já feito antes, mas idempotente)
create extension if not exists unaccent;

-- 1) Remover qualquer CHECK antigo sobre a coluna type e adicionar o novo com 'victory'
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'notifications'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '% type % in %'
  loop
    execute format('alter table public.notifications drop constraint %I', r.conname);
  end loop;
end$$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('message','error','agendamento','followup','victory'));

-- 2) Função SQL para detecção de sucesso ("vitória")
create or replace function public._is_victory_sql(msg jsonb)
returns boolean
language plpgsql
as $$
declare
  raw text := coalesce(msg->>'content', msg->>'text', '');
  n text := unaccent(lower(raw));
begin
  -- Agendamento/visita/reunião confirmados/marcados
  if (n ~ '(agendad|marcad|confirmad)') and (n like '%agendamento%' or n like '%agenda%' or n like '%visita%' or n like '%reuniao%' or n like '%call%' or n like '%chamada%' or n like '%encontro%') then
    return true;
  end if;

  -- Venda/fechamento
  if n like '%venda realizada%' or n like '%fechou%' or n like '%fechado%' or n like '%fechamento%' or n like '%contrato fechado%' then
    return true;
  end if;

  -- Matrícula / assinatura
  if n like '%matricula concluida%' or n like '%matricula realizada%' or n like '%assinou%' or n like '%assinatura concluida%' then
    return true;
  end if;

  -- Parabéns com contexto (heurística simples)
  if n like '%parabens%' then
    return true;
  end if;

  return false;
end$$;

-- 3) Atualiza trigger de chat para classificar message/error/victory
create or replace function public.fn_notify_on_chat_insert()
returns trigger
language plpgsql
as $$
declare
  sess text := new.session_id;
  numero text := case
    when sess like '%@s.whatsapp.net' then replace(sess, '@s.whatsapp.net','')
    else null
  end;
  msg jsonb := new.message;
  is_err boolean := public._is_semantic_error_sql(msg);
  is_win boolean := public._is_victory_sql(msg);
  title text;
  kind text;
  descr text := coalesce(msg->>'content', msg->>'text', '');
begin
  if is_err then
    kind := 'error';
    title := 'Mensagem de ERRO';
  elsif is_win then
    kind := 'victory';
    title := 'Mensagem de VITÓRIA';
  else
    kind := 'message';
    title := 'Nova mensagem';
  end if;

  insert into public.notifications(type, title, description, source_table, source_id, session_id, numero)
  values (kind, title, descr, 'sofian8n_chat_histories', new.id::text, sess, numero);

  return new;
end$$;

drop trigger if exists trg_notify_chat_insert on public.sofian8n_chat_histories;
create trigger trg_notify_chat_insert
after insert on public.sofian8n_chat_histories
for each row execute function public.fn_notify_on_chat_insert();

-- 4) Garante que public.notifications está na publicação Realtime
do $$ begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then
    null;
  end;
end $$;

-- 5) Policies/GRANTs (idempotentes) – caso ainda não tenham sido aplicadas
alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications' and policyname='notif_select_all'
  ) then
    create policy notif_select_all
      on public.notifications
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='notifications' and policyname='notif_update_read'
  ) then
    create policy notif_update_read
      on public.notifications
      for update
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end$$;

grant select, update on table public.notifications to anon, authenticated;
