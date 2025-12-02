-- Extensões úteis
create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- 1) Tabela de notificações
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('message','error','agendamento','followup')),
  title text,
  description text,
  source_table text,
  source_id text,
  session_id text,
  numero text,
  read boolean not null default false
);

create index if not exists idx_notifications_created_at on public.notifications (created_at desc);
create index if not exists idx_notifications_read on public.notifications (read);

-- 2) RLS e policies (leitura geral e marcar como lida)
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

-- 3) Funções de trigger

-- 3.1) Heurística simples para erro em SQL (normaliza acentos)
create or replace function public._is_semantic_error_sql(msg jsonb)
returns boolean
language plpgsql
as $$
declare
  t text := lower(coalesce(msg->>'type',''));
  raw text := coalesce(msg->>'content', msg->>'text', '');
  n text := unaccent(lower(coalesce(msg->>'content', msg->>'text','')));
begin
  if t = 'error' then
    return true;
  end if;

  if n like '%erro%' or n like '%errad%' then
    return true;
  end if;

  if n like '%problema tecnic%' then
    return true;
  end if;

  if n like '%houve %problema tecnic%' or n like '%ocorreu %problema tecnic%' or
     n like '%tivemos %problema tecnic%' or n like '%estamos com %problema tecnic%' or
     n like '%identificamos %problema tecnic%' then
    return true;
  end if;

  if n like '%ajustar e verificar novamente%' then
    return true;
  end if;

  if n like '%fora do ar%' or n like '%saiu do ar%' or n like '%instabilidade%' or n like '%indisponibilidade%' then
    return true;
  end if;

  return false;
end$$;

-- 3.2) Chat -> Notifications
create or replace function public.fn_notify_on_chat_insert()
returns trigger
language plpgsql
as $$
declare
  is_err boolean;
  sess text := new.session_id;
  numero text := case
    when sess like '%@s.whatsapp.net' then replace(sess, '@s.whatsapp.net','')
    else null
  end;
  msg jsonb := new.message;
  title text;
  descr text;
begin
  is_err := public._is_semantic_error_sql(msg);
  title := case when is_err then 'Mensagem de ERRO' else 'Nova mensagem' end;
  descr := coalesce(msg->>'content', msg->>'text', '');

  insert into public.notifications(type, title, description, source_table, source_id, session_id, numero)
  values (case when is_err then 'error' else 'message' end, title, descr, 'sofian8n_chat_histories', new.id::text, sess, numero);

  return new;
end$$;

drop trigger if exists trg_notify_chat_insert on public.sofian8n_chat_histories;
create trigger trg_notify_chat_insert
after insert on public.sofian8n_chat_histories
for each row execute function public.fn_notify_on_chat_insert();

-- 3.3) Agendamentos -> Notifications (tenta ambos os nomes)
create or replace function public.fn_notify_on_agendamento_insert()
returns trigger
language plpgsql
as $$
declare
  tname text := tg_table_name;
  nome text := coalesce(new.nome_aluno, new.nome_responsavel, 'Novo agendamento');
  dia text := coalesce(new.dia,'');
  horario text := coalesce(new.horario,'');
  descr text := trim(both ' ' from nome || ' • ' || dia || ' ' || horario);
begin
  insert into public.notifications(type, title, description, source_table, source_id)
  values ('agendamento', 'Novo agendamento', descr, tname, new.id::text);
  return new;
end$$;

do $$ begin
  begin
    drop trigger if exists trg_notify_agendamento_insert on public."Agendamentos";
    create trigger trg_notify_agendamento_insert
    after insert on public."Agendamentos"
    for each row execute function public.fn_notify_on_agendamento_insert();
  exception when undefined_table then
    null;
  end;
end $$;

do $$ begin
  begin
    drop trigger if exists trg_notify_agendamentos_insert on public.agendamentos;
    create trigger trg_notify_agendamentos_insert
    after insert on public.agendamentos
    for each row execute function public.fn_notify_on_agendamento_insert();
  exception when undefined_table then
    null;
  end;
end $$;

-- 3.4) Follow-up -> Notifications
create or replace function public.fn_notify_on_followup_insert()
returns trigger
language plpgsql
as $$
declare
  numero text := coalesce(new.numero, 'sem número');
  estagio text := coalesce(new.estagio, null);
  descr text := case when estagio is null then numero else numero || ' • ' || estagio end;
begin
  insert into public.notifications(type, title, description, source_table, source_id)
  values ('followup', 'Novo follow-up', descr, 'sofia_followup', new.id::text);
  return new;
end$$;

drop trigger if exists trg_notify_followup_insert on public.sofia_followup;
create trigger trg_notify_followup_insert
after insert on public.sofia_followup
for each row execute function public.fn_notify_on_followup_insert();
