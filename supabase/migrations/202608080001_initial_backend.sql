create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  format_version smallint not null default 1 check (format_version = 1),
  active_sprite_id uuid,
  palette jsonb not null default '[]'::jsonb check (jsonb_typeof(palette) = 'array'),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.sprites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null check (char_length(name) <= 80),
  format_version smallint not null default 1 check (format_version = 1),
  width smallint not null check (width between 4 and 512),
  height smallint not null check (height between 4 and 512),
  background text not null default 'transparent',
  pixels jsonb not null check (jsonb_typeof(pixels) = 'array' and jsonb_array_length(pixels) = width * height),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

create table public.palettes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  colors jsonb not null check (jsonb_typeof(colors) = 'array'),
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_updated_idx on public.projects(owner_id, updated_at desc) where deleted_at is null;
create index sprites_project_position_idx on public.sprites(project_id, position);
create index palettes_owner_updated_idx on public.palettes(owner_id, updated_at desc);

create function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger sprites_set_updated_at before update on public.sprites for each row execute function public.set_updated_at();
create trigger palettes_set_updated_at before update on public.palettes for each row execute function public.set_updated_at();

create function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created after insert on auth.users for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.sprites enable row level security;
alter table public.palettes enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "projects_select_own" on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy "projects_insert_own" on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "projects_update_own" on public.projects for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "projects_delete_own" on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "sprites_select_own_project" on public.sprites for select to authenticated using (exists (select 1 from public.projects where projects.id = sprites.project_id and projects.owner_id = (select auth.uid())));
create policy "sprites_insert_own_project" on public.sprites for insert to authenticated with check (exists (select 1 from public.projects where projects.id = sprites.project_id and projects.owner_id = (select auth.uid())));
create policy "sprites_update_own_project" on public.sprites for update to authenticated using (exists (select 1 from public.projects where projects.id = sprites.project_id and projects.owner_id = (select auth.uid()))) with check (exists (select 1 from public.projects where projects.id = sprites.project_id and projects.owner_id = (select auth.uid())));
create policy "sprites_delete_own_project" on public.sprites for delete to authenticated using (exists (select 1 from public.projects where projects.id = sprites.project_id and projects.owner_id = (select auth.uid())));

create policy "palettes_select_own" on public.palettes for select to authenticated using ((select auth.uid()) = owner_id);
create policy "palettes_insert_own" on public.palettes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "palettes_update_own" on public.palettes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "palettes_delete_own" on public.palettes for delete to authenticated using ((select auth.uid()) = owner_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects, public.sprites, public.palettes to authenticated;
