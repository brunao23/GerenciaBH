-- Atualiza triggers para incluir 'numero' nas notificações de agendamento e follow-up,
-- e já incluímos antes em chat. Não altera schema (coluna numero já existe).

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
  numero text := coalesce(new.contato, null);
begin
  insert into public.notifications(type, title, description, source_table, source_id, numero)
  values ('agendamento', 'Novo agendamento', descr, tname, new.id::text, numero);
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

create or replace function public.fn_notify_on_followup_insert()
returns trigger
language plpgsql
as $$
declare
  numero text := coalesce(new.numero, 'sem número');
  estagio text := coalesce(new.estagio, null);
  descr text := case when estagio is null then numero else numero || ' • ' || estagio end;
begin
  insert into public.notifications(type, title, description, source_table, source_id, numero)
  values ('followup', 'Novo follow-up', descr, 'sofia_followup', new.id::text, new.numero);
  return new;
end$$;

drop trigger if exists trg_notify_followup_insert on public.sofia_followup;
create trigger trg_notify_followup_insert
after insert on public.sofia_followup
for each row execute function public.fn_notify_on_followup_insert();
