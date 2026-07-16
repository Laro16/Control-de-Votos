-- ============================================================================
-- CENSO POLÍTICO — Configuración completa de Supabase
-- Ejecutar TODO este archivo en: Supabase → SQL Editor → New query → Run
-- ============================================================================
-- Arquitectura de seguridad:
--   · Las tablas quedan BLOQUEADAS por RLS: nadie puede insertarles ni
--     leerlas directo con la anon key (que viaja visible en el código JS).
--   · La ÚNICA vía de escritura es la función registrar_familia(payload),
--     que valida e inserta familia + votos en una sola transacción.
--   · La lectura (dashboard) solo funciona con una sesión autenticada:
--     un único usuario creado en Authentication → Users (ver README, paso 3).
-- ============================================================================

-- 1. TABLAS ------------------------------------------------------------------

create table if not exists public.familias (
  id             uuid primary key default gen_random_uuid(),
  departamento   text not null,
  municipio      text not null,
  aldea          text,
  caserio        text,
  barrio         text,
  nombre_familia text not null,
  telefono       text,
  registrado_por text,                 -- 'digitador' | 'admin' (viene del login local)
  created_at     timestamptz not null default now()
);

create table if not exists public.votos (
  id          uuid primary key default gen_random_uuid(),
  familia_id  uuid not null references public.familias(id) on delete cascade,
  partido     text not null,           -- sigla del partido (debe existir en configData.js)
  cantidad    integer not null check (cantidad between 1 and 50),
  created_at  timestamptz not null default now()
);

create index if not exists idx_familias_ubicacion on public.familias (departamento, municipio);
create index if not exists idx_votos_partido      on public.votos (partido);
create index if not exists idx_votos_familia      on public.votos (familia_id);

-- 2. SEGURIDAD (RLS) ---------------------------------------------------------
-- RLS activado y SIN políticas de INSERT/UPDATE/DELETE:
-- por defecto todo queda denegado, incluso con la anon key.

alter table public.familias enable row level security;
alter table public.votos    enable row level security;

-- Lectura SOLO para sesiones autenticadas (la cuenta que usa el dashboard).
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

-- 3. FUNCIÓN DE INGRESO (única puerta de escritura) --------------------------
-- security definer: corre con permisos del dueño y salta el RLS,
-- pero solo hace lo que está programado aquí (insertar, nunca leer/borrar).

create or replace function public.registrar_familia(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nueva_familia uuid;
  voto jsonb;
begin
  -- Validaciones mínimas del lado del servidor
  if coalesce(trim(payload->>'departamento'), '') = '' then
    raise exception 'departamento es obligatorio';
  end if;
  if coalesce(trim(payload->>'municipio'), '') = '' then
    raise exception 'municipio es obligatorio';
  end if;
  if coalesce(trim(payload->>'nombre_familia'), '') = '' then
    raise exception 'nombre_familia es obligatorio';
  end if;
  if jsonb_array_length(coalesce(payload->'votos', '[]'::jsonb)) = 0 then
    raise exception 'debe incluir al menos una línea de votos';
  end if;

  insert into public.familias
    (departamento, municipio, aldea, caserio, barrio,
     nombre_familia, telefono, registrado_por)
  values
    (trim(payload->>'departamento'),
     trim(payload->>'municipio'),
     nullif(trim(coalesce(payload->>'aldea',   '')), ''),
     nullif(trim(coalesce(payload->>'caserio', '')), ''),
     nullif(trim(coalesce(payload->>'barrio',  '')), ''),
     trim(payload->>'nombre_familia'),
     nullif(trim(coalesce(payload->>'telefono','')), ''),
     nullif(trim(coalesce(payload->>'registrado_por','')), ''))
  returning id into nueva_familia;

  for voto in select * from jsonb_array_elements(payload->'votos') loop
    insert into public.votos (familia_id, partido, cantidad)
    values (nueva_familia, voto->>'partido', (voto->>'cantidad')::int);
  end loop;

  return nueva_familia;
end;
$$;

-- Solo la app (anon) y sesiones autenticadas pueden ejecutarla.
revoke all on function public.registrar_familia(jsonb) from public;
grant execute on function public.registrar_familia(jsonb) to anon, authenticated;

-- 4. VISTA PARA EL DASHBOARD --------------------------------------------------
-- security_invoker = on → la vista respeta el RLS de las tablas de abajo,
-- por lo tanto solo una sesión autenticada puede consultarla.

create or replace view public.vista_censo
with (security_invoker = on) as
select
  f.id            as familia_id,
  f.departamento,
  f.municipio,
  f.aldea,
  f.caserio,
  f.barrio,
  f.nombre_familia,
  f.telefono,
  f.registrado_por,
  f.created_at    as fecha_registro,
  v.partido,
  v.cantidad
from public.votos v
join public.familias f on f.id = v.familia_id;

grant select on public.vista_censo to authenticated;

-- ============================================================================
-- FIN DE CAMPAÑA (guardar para después — NO ejecutar ahora):
-- borrar el censo completo cuando el cliente cierre el proyecto:
--   truncate table public.votos, public.familias;
-- ============================================================================
