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
  modo_registro  text not null default 'FAMILIA',
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

create table if not exists public.personas (
  id              uuid primary key default gen_random_uuid(),
  familia_id      uuid not null references public.familias(id) on delete cascade,
  nombre_persona  text not null,
  telefono        text,
  partido         text not null,
  created_at      timestamptz not null default now()
);

-- Completa instalaciones antiguas sin borrar información existente.
alter table public.familias add column if not exists comunidad text;
alter table public.familias add column if not exists direccion text;
alter table public.familias add column if not exists modo_registro text not null default 'FAMILIA';
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
create index if not exists idx_personas_familia
  on public.personas (familia_id);
create index if not exists idx_personas_partido
  on public.personas (partido);

alter table public.familias drop constraint if exists familias_modo_registro_valido;
alter table public.familias
  add constraint familias_modo_registro_valido
  check (modo_registro in ('FAMILIA', 'PERSONAS')) not valid;

-- Admite seis partidos y la opción NEUTRAL (sin preferencia). Se recrea la
-- restricción al volver a ejecutar este archivo para actualizar instalaciones
-- que todavía sólo admitían P1–P6. NOT VALID conserva datos históricos atípicos
-- pero protege inmediatamente todas las filas nuevas.
alter table public.votos drop constraint if exists votos_partido_valido;
alter table public.votos
  add constraint votos_partido_valido
  check (partido in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'NEUTRAL')) not valid;

alter table public.personas drop constraint if exists personas_partido_valido;
alter table public.personas
  add constraint personas_partido_valido
  check (partido in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'NEUTRAL')) not valid;

-- 2. ACCESO BÁSICO -----------------------------------------------------------
-- La aplicación usa Supabase Auth. Todos los usuarios autenticados pueden
-- registrar datos; el rol admin controla la visibilidad del dashboard.

alter table public.familias enable row level security;
alter table public.votos    enable row level security;
alter table public.personas enable row level security;

drop policy if exists "lectura_solo_admin_familias" on public.familias;
drop policy if exists "lectura_solo_admin_votos" on public.votos;
drop policy if exists "lectura_solo_admin_personas" on public.personas;

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

drop policy if exists "lectura_autenticada_personas" on public.personas;
create policy "lectura_autenticada_personas"
  on public.personas for select
  to authenticated
  using (true);

-- 3. FUNCIÓN DE INGRESO ------------------------------------------------------
-- Inserta una familia en uno de dos modos excluyentes:
--   FAMILIA  → cantidades agrupadas por preferencia.
--   PERSONAS → nombres individuales; los votos agrupados se calculan solos.

create or replace function public.registrar_familia(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva_familia uuid;
  voto jsonb;
  persona jsonb;
  correo_usuario text;
  modo text;
  lista_votos jsonb;
  lista_personas jsonb;
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
  modo := upper(coalesce(nullif(trim(payload->>'modo_registro'), ''), 'FAMILIA'));
  lista_votos := coalesce(payload->'votos', '[]'::jsonb);
  lista_personas := coalesce(payload->'personas', '[]'::jsonb);

  if modo not in ('FAMILIA', 'PERSONAS') then
    raise exception 'modo_registro debe ser FAMILIA o PERSONAS';
  end if;
  if jsonb_typeof(lista_votos) <> 'array' then
    raise exception 'votos debe ser una lista';
  end if;
  if jsonb_typeof(lista_personas) <> 'array' then
    raise exception 'personas debe ser una lista';
  end if;

  if modo = 'FAMILIA' then
    if jsonb_array_length(lista_votos) = 0 then
      raise exception 'debe incluir al menos una línea de votos';
    end if;
    if jsonb_array_length(lista_votos) > 7 then
      raise exception 'no puede incluir más de siete preferencias';
    end if;
    if jsonb_array_length(lista_personas) > 0 then
      raise exception 'el modo FAMILIA no admite personas individuales';
    end if;
  else
    if jsonb_array_length(lista_personas) = 0 then
      raise exception 'debe incluir al menos una persona';
    end if;
    if jsonb_array_length(lista_personas) > 50 then
      raise exception 'una familia no puede incluir más de cincuenta personas';
    end if;
    if jsonb_array_length(lista_votos) > 0 then
      raise exception 'el modo PERSONAS no admite cantidades agrupadas';
    end if;
  end if;

  if modo = 'FAMILIA' and exists (
    select 1
    from jsonb_array_elements(lista_votos) as elementos(elemento)
    where coalesce(elemento->>'partido', '') not in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'NEUTRAL')
  ) then
    raise exception 'la lista contiene una preferencia no válida';
  end if;
  if modo = 'FAMILIA' and exists (
    select elemento->>'partido'
    from jsonb_array_elements(lista_votos) as elementos(elemento)
    group by elemento->>'partido'
    having count(*) > 1
  ) then
    raise exception 'una preferencia no puede repetirse en la misma familia';
  end if;
  if modo = 'PERSONAS' and exists (
    select 1
    from jsonb_array_elements(lista_personas) as elementos(elemento)
    where coalesce(trim(elemento->>'nombre'), '') = ''
       or coalesce(elemento->>'partido', '') not in ('P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'NEUTRAL')
  ) then
    raise exception 'cada persona necesita nombre y una preferencia válida';
  end if;

  correo_usuario := coalesce(nullif(auth.jwt()->>'email', ''), 'usuario');

  insert into public.familias
    (departamento, municipio, comunidad, caserio, barrio, direccion,
     nombre_familia, telefono, modo_registro, registrado_por)
  values
    (trim(payload->>'departamento'),
     trim(payload->>'municipio'),
     nullif(trim(coalesce(payload->>'comunidad', '')), ''),
     nullif(trim(coalesce(payload->>'caserio',   '')), ''),
     nullif(trim(coalesce(payload->>'barrio',    '')), ''),
     nullif(trim(coalesce(payload->>'direccion', '')), ''),
     trim(payload->>'nombre_familia'),
     nullif(trim(coalesce(payload->>'telefono',  '')), ''),
     modo,
     correo_usuario)
  returning id into nueva_familia;

  if modo = 'FAMILIA' then
    for voto in select * from jsonb_array_elements(lista_votos) loop
      if coalesce(voto->>'cantidad', '') !~ '^[0-9]+$' then
        raise exception 'la cantidad de votos debe ser un número entero';
      end if;
      if (voto->>'cantidad')::integer not between 1 and 50 then
        raise exception 'cada cantidad debe estar entre 1 y 50';
      end if;

      insert into public.votos (familia_id, partido, cantidad)
      values (nueva_familia, voto->>'partido', (voto->>'cantidad')::integer);
    end loop;
  else
    for persona in select * from jsonb_array_elements(lista_personas) loop
      insert into public.personas (familia_id, nombre_persona, telefono, partido)
      values (
        nueva_familia,
        trim(persona->>'nombre'),
        nullif(trim(coalesce(persona->>'telefono', '')), ''),
        persona->>'partido'
      );
    end loop;

    insert into public.votos (familia_id, partido, cantidad)
    select nueva_familia, p.partido, count(*)::integer
    from public.personas p
    where p.familia_id = nueva_familia
    group by p.partido;
  end if;

  return nueva_familia;
end;
$$;

revoke all on function public.registrar_familia(jsonb) from public, anon;
grant execute on function public.registrar_familia(jsonb) to authenticated;

-- 4. ELIMINACIÓN RECUPERABLE -------------------------------------------------
-- El administrador puede anular una familia completa. Los votos se conservan
-- vinculados para que la operación sea recuperable, pero la vista del dashboard
-- deja de mostrar inmediatamente la familia y todas sus cantidades.

-- DROP es necesario al actualizar instalaciones que tenían esta función con
-- otro tipo de retorno. Solo reemplaza la función; no elimina familias ni votos.
drop function if exists public.anular_familia(uuid);

create or replace function public.anular_familia(familia_objetivo uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  filas_afectadas integer;
  correo_usuario text;
begin
  if auth.uid() is null then
    raise exception 'debe iniciar sesión';
  end if;
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception 'solo el administrador puede eliminar registros';
  end if;

  correo_usuario := coalesce(nullif(auth.jwt()->>'email', ''), 'administrador');

  update public.familias
  set anulado = true,
      anulado_en = now(),
      anulado_por = correo_usuario
  where id = familia_objetivo
    and anulado = false;

  get diagnostics filas_afectadas = row_count;
  return filas_afectadas > 0;
end;
$$;

revoke all on function public.anular_familia(uuid) from public, anon;
grant execute on function public.anular_familia(uuid) to authenticated;

-- 5. VISTAS PARA EL DASHBOARD ------------------------------------------------

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
  f.modo_registro,
  f.registrado_por,
  f.created_at    as fecha_registro,
  v.partido,
  v.cantidad
from public.votos v
join public.familias f on f.id = v.familia_id
where f.anulado = false;

grant select on public.vista_censo to authenticated;

drop view if exists public.vista_personas;
create view public.vista_personas
with (security_invoker = on) as
select
  p.id            as persona_id,
  p.familia_id,
  p.nombre_persona,
  p.telefono      as telefono_persona,
  p.partido,
  p.created_at    as fecha_persona,
  f.departamento,
  f.municipio,
  f.comunidad,
  f.caserio,
  f.barrio,
  f.direccion,
  f.nombre_familia,
  f.telefono      as telefono_familia,
  f.registrado_por,
  f.created_at    as fecha_registro
from public.personas p
join public.familias f on f.id = p.familia_id
where f.anulado = false;

grant select on public.vista_personas to authenticated;

-- 6. ASIGNAR EL ROL DE ADMINISTRADOR ----------------------------------------
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
-- truncate table public.personas, public.votos, public.familias;
