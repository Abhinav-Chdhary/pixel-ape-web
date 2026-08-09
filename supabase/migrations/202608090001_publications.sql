-- Public artwork lives in immutable publication snapshots. The browser never
-- receives direct public access to the private workspace tables.
create function public.new_publication_slug()
returns text
language sql volatile set search_path = '' as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_')
$$;

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_project_id uuid not null,
  source_sprite_id uuid not null,
  slug text not null default public.new_publication_slug() check (slug ~ '^[A-Za-z0-9_-]{24}$'),
  visibility text not null check (visibility in ('unlisted', 'gallery')),
  title text not null check (char_length(title) between 1 and 80),
  width smallint not null check (width between 4 and 512),
  height smallint not null check (height between 4 and 512),
  background text not null check (octet_length(background) <= 64),
  pixels jsonb not null check (public.valid_pixel_array(pixels, width::integer * height::integer)),
  preview_width smallint not null check (preview_width between 1 and 64),
  preview_height smallint not null check (preview_height between 1 and 64),
  preview_pixels jsonb not null check (public.valid_pixel_array(preview_pixels, preview_width::integer * preview_height::integer)),
  author_name text not null default 'Anonymous' check (char_length(author_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_project_id, source_sprite_id),
  unique (slug)
);

create index publications_gallery_updated_idx on public.publications(updated_at desc, id desc) where visibility = 'gallery';
create trigger publications_set_updated_at before update on public.publications for each row execute function public.set_updated_at();

alter table public.publications enable row level security;
-- Intentionally grant no browser role access. The Zerops API uses a server-only
-- service-role client and exposes only the safe publication representation.
grant select, insert, update on public.publications to service_role;
grant select on public.projects, public.sprites, public.profiles to service_role;
