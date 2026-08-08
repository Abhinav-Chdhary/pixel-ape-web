-- Bound user-controlled JSON and make the atomic workspace RPCs the only
-- authenticated write path for projects and sprites. Limits are intentionally
-- enforced both by table constraints and before SECURITY DEFINER writes.

create or replace function public.valid_color_array(value jsonb, max_items integer)
returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare
  color jsonb;
begin
  if jsonb_typeof(value) <> 'array'
     or jsonb_array_length(value) > max_items
     or octet_length(value::text) > 32768 then
    return false;
  end if;
  for color in select item from jsonb_array_elements(value) as input(item) loop
    if jsonb_typeof(color) not in ('string', 'null')
       or (jsonb_typeof(color) = 'string' and octet_length(color #>> '{}') > 64) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.valid_pixel_array(value jsonb, expected_items integer)
returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare
  pixel jsonb;
begin
  if expected_items not between 16 and 262144
     or jsonb_typeof(value) <> 'array'
     or jsonb_array_length(value) <> expected_items
     or octet_length(value::text) > 4194304 then
    return false;
  end if;
  for pixel in select item from jsonb_array_elements(value) as input(item) loop
    if jsonb_typeof(pixel) not in ('string', 'null')
       or (jsonb_typeof(pixel) = 'string' and octet_length(pixel #>> '{}') > 64) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.validate_workspace_payload(
  p_name text,
  p_active_sprite_id uuid,
  p_palette jsonb,
  p_sprites jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  sprite_count integer;
  sprite jsonb;
  sprite_index integer;
  sprite_width integer;
  sprite_height integer;
  total_pixels integer := 0;
begin
  if p_name is null or char_length(p_name) not between 1 and 80 then
    raise exception 'project name must contain 1 to 80 characters' using errcode = '22023';
  end if;
  if p_active_sprite_id is null then
    raise exception 'active sprite is required' using errcode = '22023';
  end if;
  if public.valid_color_array(p_palette, 256) is not true then
    raise exception 'invalid palette' using errcode = '22023';
  end if;
  if p_sprites is null or jsonb_typeof(p_sprites) <> 'array' then
    raise exception 'sprites must be an array' using errcode = '22023';
  end if;

  sprite_count := jsonb_array_length(p_sprites);
  if sprite_count not between 1 and 50 then
    raise exception 'a workspace must contain 1 to 50 sprites' using errcode = '22023';
  end if;
  if octet_length(p_sprites::text) > 4194304 then
    raise exception 'workspace sprite payload exceeds 4 MiB' using errcode = '22023';
  end if;
  for sprite_index in 0..sprite_count - 1 loop
    sprite := p_sprites->sprite_index;
    if jsonb_typeof(sprite) <> 'object'
       or (select count(*) from jsonb_object_keys(sprite)) <> 8
       or exists (
         select 1 from jsonb_object_keys(sprite) as key(name)
         where name not in ('id', 'position', 'name', 'format_version', 'width', 'height', 'background', 'pixels')
       ) then
      raise exception 'sprite % has an invalid object shape', sprite_index using errcode = '22023';
    end if;
    if jsonb_typeof(sprite->'id') <> 'string'
       or not ((sprite->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or jsonb_typeof(sprite->'position') <> 'number'
       or not ((sprite->>'position') ~ '^(0|[1-9][0-9]*)$')
       or octet_length(sprite->>'position') > 2
       or (sprite->>'position')::numeric <> sprite_index
       or jsonb_typeof(sprite->'name') <> 'string'
       or char_length(sprite->>'name') > 80
       or jsonb_typeof(sprite->'format_version') <> 'number'
       or sprite->>'format_version' <> '1'
       or jsonb_typeof(sprite->'background') <> 'string'
       or octet_length(sprite->>'background') > 64 then
      raise exception 'sprite % has invalid metadata', sprite_index using errcode = '22023';
    end if;
    if jsonb_typeof(sprite->'width') <> 'number'
       or not ((sprite->>'width') ~ '^[0-9]+$')
       or octet_length(sprite->>'width') > 3
       or (sprite->>'width')::numeric not between 4 and 512
       or jsonb_typeof(sprite->'height') <> 'number'
       or not ((sprite->>'height') ~ '^[0-9]+$')
       or octet_length(sprite->>'height') > 3
       or (sprite->>'height')::numeric not between 4 and 512 then
      raise exception 'sprite % has invalid dimensions', sprite_index using errcode = '22023';
    end if;
    sprite_width := (sprite->>'width')::integer;
    sprite_height := (sprite->>'height')::integer;
    total_pixels := total_pixels + sprite_width * sprite_height;
    if total_pixels > 262144 then
      raise exception 'workspace exceeds 262,144 total pixels' using errcode = '22023';
    end if;
    if public.valid_pixel_array(sprite->'pixels', sprite_width * sprite_height) is not true then
      raise exception 'sprite % has invalid pixels', sprite_index using errcode = '22023';
    end if;
  end loop;

  if (select count(distinct sprite->>'id') from jsonb_array_elements(p_sprites) as input(sprite)) <> sprite_count then
    raise exception 'sprite IDs must be unique' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_sprites) as input(sprite)
    where sprite->>'id' = p_active_sprite_id::text
  ) then
    raise exception 'active sprite must belong to the workspace' using errcode = '22023';
  end if;
end;
$$;

-- NOT VALID preserves upgradeability if a legacy account already exceeds a
-- new limit; PostgreSQL still enforces these checks for every new/changed row.
alter table public.profiles
  add constraint profiles_display_name_bounded check (display_name is null or char_length(display_name) <= 120) not valid,
  add constraint profiles_avatar_url_bounded check (avatar_url is null or char_length(avatar_url) <= 2048) not valid,
  add constraint profiles_preferences_bounded check (
    jsonb_typeof(preferences) = 'object'
    and octet_length(preferences::text) <= 32768
  ) not valid;

alter table public.projects
  add constraint projects_palette_bounded check (public.valid_color_array(palette, 256)) not valid;
alter table public.sprites
  add constraint sprites_background_bounded check (octet_length(background) <= 64) not valid,
  add constraint sprites_pixels_bounded check (public.valid_pixel_array(pixels, width::integer * height::integer)) not valid;
alter table public.palettes
  add constraint palettes_colors_bounded check (public.valid_color_array(colors, 256)) not valid;

create or replace function public.enforce_palette_quota()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  if (select count(*) from public.palettes where owner_id = new.owner_id) >= 100 then
    raise exception 'palette quota exceeded' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger palettes_enforce_quota
before insert on public.palettes
for each row execute function public.enforce_palette_quota();

-- Provider-controlled OAuth metadata is user input too. Truncate it before the
-- profile insert so an oversized identity claim cannot make signup fail.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    left(new.raw_user_meta_data ->> 'avatar_url', 2048)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.create_workspace(
  p_project_id uuid,
  p_name text,
  p_active_sprite_id uuid,
  p_palette jsonb,
  p_sprites jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  perform public.validate_workspace_payload(p_name, p_active_sprite_id, p_palette, p_sprites);

  -- Serialize quota checks per account so concurrent creates cannot exceed it.
  perform pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));
  if (select count(*) from public.projects where owner_id = caller_id) >= 25 then
    raise exception 'project quota exceeded' using errcode = '54000';
  end if;

  insert into public.projects(id, owner_id, name, active_sprite_id, palette)
  values (p_project_id, caller_id, p_name, p_active_sprite_id, p_palette);

  insert into public.sprites(id, project_id, position, name, format_version, width, height, background, pixels)
  select id, p_project_id, position, name, format_version, width, height, background, pixels
  from jsonb_to_recordset(p_sprites) as sprite(
    id uuid, position integer, name text, format_version smallint,
    width smallint, height smallint, background text, pixels jsonb
  );
  return 1;
end;
$$;

create or replace function public.save_workspace(
  p_project_id uuid,
  p_expected_revision integer,
  p_name text,
  p_active_sprite_id uuid,
  p_palette jsonb,
  p_sprites jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  current_revision integer;
begin
  if caller_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  perform public.validate_workspace_payload(p_name, p_active_sprite_id, p_palette, p_sprites);

  select revision into current_revision
  from public.projects
  where id = p_project_id and owner_id = caller_id
  for update;

  if current_revision is null or current_revision <> p_expected_revision then
    raise exception 'workspace revision conflict' using errcode = '40001';
  end if;

  update public.projects
  set name = p_name,
      active_sprite_id = p_active_sprite_id,
      palette = p_palette,
      revision = revision + 1
  where id = p_project_id and owner_id = caller_id;

  delete from public.sprites where project_id = p_project_id;
  insert into public.sprites(id, project_id, position, name, format_version, width, height, background, pixels)
  select id, p_project_id, position, name, format_version, width, height, background, pixels
  from jsonb_to_recordset(p_sprites) as sprite(
    id uuid, position integer, name text, format_version smallint,
    width smallint, height smallint, background text, pixels jsonb
  );

  return current_revision + 1;
end;
$$;

-- Reads still use RLS. Mutations are atomic and authorized inside the RPCs.
revoke insert, update, delete on public.projects, public.sprites from authenticated;

revoke all on function public.valid_color_array(jsonb, integer) from public;
revoke all on function public.valid_pixel_array(jsonb, integer) from public;
revoke all on function public.validate_workspace_payload(text, uuid, jsonb, jsonb) from public;
revoke all on function public.enforce_palette_quota() from public;
revoke all on function public.valid_color_array(jsonb, integer) from authenticated;
revoke all on function public.valid_pixel_array(jsonb, integer) from authenticated;
revoke all on function public.validate_workspace_payload(text, uuid, jsonb, jsonb) from authenticated;
revoke all on function public.enforce_palette_quota() from authenticated;
revoke all on function public.create_profile_for_new_user() from public;
revoke all on function public.create_profile_for_new_user() from authenticated;
revoke all on function public.create_workspace(uuid, text, uuid, jsonb, jsonb) from public;
revoke all on function public.save_workspace(uuid, integer, text, uuid, jsonb, jsonb) from public;
grant execute on function public.create_workspace(uuid, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_workspace(uuid, integer, text, uuid, jsonb, jsonb) to authenticated;
-- Palette rows intentionally remain RLS-writable, so their bounded, immutable
-- CHECK helper must be executable by the writing role.
grant execute on function public.valid_color_array(jsonb, integer) to authenticated;
