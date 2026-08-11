-- ============================================================================
-- CENSOGT — Configuración completa de Supabase
-- Fuente de verdad del esquema. Se puede ejecutar en una base nueva o volver a
-- ejecutar después de actualizar el proyecto.
-- ============================================================================

-- 1. TABLAS ------------------------------------------------------------------

create table if not exists public.familias (
  id             uuid primary key default gen_random_uuid(),
  departamento   text not null,
  municipio      text not null,
  comunidad      text,
  caserio        text,
  barrio         text,
  direccion      text,
  nombre_familia text not null,
  telefono       text,
  registrado_por text,
  created_at     timestamptz not null default now(),
  anulado        boolean not null default false,
  anulado_en     timestamptz,
  anulado_por    text
);

create table if not exists public.votos (
  id          uuid primary key default gen_random_uuid(),
  familia_id  uuid not null references public.familias(id) on delete cascade,
  partido     text not null,
  cantidad    integer not null check (cantidad between 1 and 50),
  created_at  timestamptz not null default now()
);

-- Completa instalaciones antiguas sin borrar información existente.
alter table public.familias add column if not exists comunidad text;
alter table public.familias add column if not exists direccion text;
alter table public.familias add column if not exists anulado boolean not null default false;
alter table public.familias add column if not exists anulado_en timestamptz;
alter table public.familias add column if not exists anulado_por text;

-- Versiones anteriores llamaban "aldea" al campo que hoy se llama "comunidad".
-- Si esa columna todavía existe, sus valores se conservan automáticamente.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'familias'
      and column_name = 'aldea'
  ) then
    execute 'update public.familias set comunidad = coalesce(comunidad, aldea) where aldea is not null';
  end if;
end;
$$;

create index if not exists idx_familias_comunidad
  on public.familias (departamento, municipio, comunidad);
create index if not exists idx_familias_activas
  on public.familias (anulado);
create index if not exists idx_votos_partido
  on public.votos (partido);
create index if not exists idx_votos_familia
  on public.votos (familia_id);

-- Sólo admite los partidos configurados actualmente. NOT VALID evita que una
-- instalación antigua falle por datos históricos, pero protege filas nuevas.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'votos_partido_valido'
      and conrelid = 'public.votos'::regclass
  ) then
    alter table public.votos
      add constraint votos_partido_valido
      check (partido in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6')) not valid;
  end if;
end;
$$;

-- 2. ACCESO BÁSICO -----------------------------------------------------------
-- La aplicación usa Supabase Auth. Todos los usuarios autenticados pueden
-- registrar datos; el rol admin controla la visibilidad del dashboard.

alter table public.familias enable row level security;
alter table public.votos    enable row level security;

drop policy if exists "lectura_solo_admin_familias" on public.familias;
drop policy if exists "lectura_solo_admin_votos" on public.votos;

drop policy if exists "lectura_autenticada_familias" on public.familias;
create policy "lectura_autenticada_familias"
  on public.familias for select
  to authenticated
  using (true);

drop policy if exists "lectura_autenticada_votos" on public.votos;
create policy "lectura_autenticada_votos"
  on public.votos for select
  to authenticated
  using (true);

-- 3. FUNCIÓN DE INGRESO ------------------------------------------------------
-- Inserta familia y votos en una sola transacción y valida los datos que el
-- formulario necesita para funcionar correctamente.

create or replace function public.registrar_familia(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva_familia uuid;
  voto jsonb;
  correo_usuario text;
begin
  if coalesce(trim(payload->>'departamento'), '') = '' then
    raise exception 'departamento es obligatorio';
  end if;
  if coalesce(trim(payload->>'municipio'), '') = '' then
    raise exception 'municipio es obligatorio';
  end if;
  if coalesce(trim(payload->>'nombre_familia'), '') = '' then
    raise exception 'nombre_familia es obligatorio';
  end if;
  if jsonb_typeof(coalesce(payload->'votos', '[]'::jsonb)) <> 'array' then
    raise exception 'votos debe ser una lista';
  end if;
  if jsonb_array_length(coalesce(payload->'votos', '[]'::jsonb)) = 0 then
    raise exception 'debe incluir al menos una línea de votos';
  end if;
  if jsonb_array_length(payload->'votos') > 6 then
    raise exception 'no puede incluir más de seis partidos';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(payload->'votos') as elementos(elemento)
    where coalesce(elemento->>'partido', '') not in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6')
  ) then
    raise exception 'la lista contiene un partido no válido';
  end if;
  if exists (
    select elemento->>'partido'
    from jsonb_array_elements(payload->'votos') as elementos(elemento)
    group by elemento->>'partido'
    having count(*) > 1
  ) then
    raise exception 'un partido no puede repetirse en la misma familia';
  end if;

  correo_usuario := coalesce(nullif(auth.jwt()->>'email', ''), 'usuario');

  insert into public.familias
    (departamento, municipio, comunidad, caserio, barrio, direccion,
     nombre_familia, telefono, registrado_por)
  values
    (trim(payload->>'departamento'),
     trim(payload->>'municipio'),
     nullif(trim(coalesce(payload->>'comunidad', '')), ''),
     nullif(trim(coalesce(payload->>'caserio',   '')), ''),
     nullif(trim(coalesce(payload->>'barrio',    '')), ''),
     nullif(trim(coalesce(payload->>'direccion', '')), ''),
     trim(payload->>'nombre_familia'),
     nullif(trim(coalesce(payload->>'telefono',  '')), ''),
     correo_usuario)
  returning id into nueva_familia;

  for voto in select * from jsonb_array_elements(payload->'votos') loop
    if coalesce(voto->>'cantidad', '') !~ '^[0-9]+$' then
      raise exception 'la cantidad de votos debe ser un número entero';
    end if;
    if (voto->>'cantidad')::integer not between 1 and 50 then
      raise exception 'cada cantidad debe estar entre 1 y 50';
    end if;

    insert into public.votos (familia_id, partido, cantidad)
    values (nueva_familia, voto->>'partido', (voto->>'cantidad')::integer);
  end loop;

  return nueva_familia;
end;
$$;

revoke all on function public.registrar_familia(jsonb) from public, anon;
grant execute on function public.registrar_familia(jsonb) to authenticated;

-- 4. VISTA PARA EL DASHBOARD -------------------------------------------------

drop view if exists public.vista_censo;
create view public.vista_censo
with (security_invoker = on) as
select
  f.id            as familia_id,
  f.departamento,
  f.municipio,
  f.comunidad,
  f.caserio,
  f.barrio,
  f.direccion,
  f.nombre_familia,
  f.telefono,
  f.registrado_por,
  f.created_at    as fecha_registro,
  v.partido,
  v.cantidad
from public.votos v
join public.familias f on f.id = v.familia_id
where f.anulado = false;

grant select on public.vista_censo to authenticated;

-- 5. ASIGNAR EL ROL DE ADMINISTRADOR ----------------------------------------
-- Crear primero el usuario en Authentication → Users. Después cambiar el
-- correo de ejemplo y ejecutar únicamente este UPDATE.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where email = 'admin@censo.app';

-- Para quitar el rol de administrador:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
-- where email = 'admin@censo.app';

-- FIN DE CAMPAÑA (NO ejecutar mientras se necesiten los datos):
-- truncate table public.votos, public.familias;
