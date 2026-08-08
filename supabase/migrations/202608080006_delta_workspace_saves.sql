-- Persist field-level workspace deltas while retaining one atomic, optimistic
-- concurrency boundary for the workspace.

alter table public.sprites
  drop constraint sprites_project_id_position_key;
alter table public.sprites
  add constraint sprites_project_id_position_key
  unique (project_id, position) deferrable initially deferred;

-- Migration 005 used `sprite` as both a PL/pgSQL variable and SQL alias. That
-- is ambiguous under the default variable-conflict setting, so replace the
-- validator forward with deliberately distinct identifiers.
create or replace function public.validate_workspace_payload(
  p_name text,
  p_active_sprite_id uuid,
  p_palette jsonb,
  p_sprites jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  sprite_count integer;
  current_sprite jsonb;
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
    current_sprite := p_sprites->sprite_index;
    if jsonb_typeof(current_sprite) <> 'object'
       or (select count(*) from jsonb_object_keys(current_sprite)) <> 8
       or exists (
         select 1 from jsonb_object_keys(current_sprite) as object_key(name)
         where object_key.name not in ('id', 'position', 'name', 'format_version', 'width', 'height', 'background', 'pixels')
       ) then
      raise exception 'sprite % has an invalid object shape', sprite_index using errcode = '22023';
    end if;
    if jsonb_typeof(current_sprite->'id') <> 'string'
       or not ((current_sprite->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
       or jsonb_typeof(current_sprite->'position') <> 'number'
       or not ((current_sprite->>'position') ~ '^(0|[1-9][0-9]*)$')
       or octet_length(current_sprite->>'position') > 2
       or (current_sprite->>'position')::numeric <> sprite_index
       or jsonb_typeof(current_sprite->'name') <> 'string'
       or char_length(current_sprite->>'name') > 80
       or jsonb_typeof(current_sprite->'format_version') <> 'number'
       or current_sprite->>'format_version' <> '1'
       or jsonb_typeof(current_sprite->'background') <> 'string'
       or octet_length(current_sprite->>'background') > 64 then
      raise exception 'sprite % has invalid metadata', sprite_index using errcode = '22023';
    end if;
    if jsonb_typeof(current_sprite->'width') <> 'number'
       or not ((current_sprite->>'width') ~ '^[0-9]+$')
       or octet_length(current_sprite->>'width') > 3
       or (current_sprite->>'width')::numeric not between 4 and 512
       or jsonb_typeof(current_sprite->'height') <> 'number'
       or not ((current_sprite->>'height') ~ '^[0-9]+$')
       or octet_length(current_sprite->>'height') > 3
       or (current_sprite->>'height')::numeric not between 4 and 512 then
      raise exception 'sprite % has invalid dimensions', sprite_index using errcode = '22023';
    end if;
    sprite_width := (current_sprite->>'width')::integer;
    sprite_height := (current_sprite->>'height')::integer;
    total_pixels := total_pixels + sprite_width * sprite_height;
    if total_pixels > 262144 then
      raise exception 'workspace exceeds 262,144 total pixels' using errcode = '22023';
    end if;
    if public.valid_pixel_array(current_sprite->'pixels', sprite_width * sprite_height) is not true then
      raise exception 'sprite % has invalid pixels', sprite_index using errcode = '22023';
    end if;
  end loop;

  if (
    select count(distinct input_sprite.value->>'id')
    from jsonb_array_elements(p_sprites) as input_sprite(value)
  ) <> sprite_count then
    raise exception 'sprite IDs must be unique' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(p_sprites) as input_sprite(value)
    where input_sprite.value->>'id' = p_active_sprite_id::text
  ) then
    raise exception 'active sprite must belong to the workspace' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.save_workspace_delta(
  p_project_id uuid,
  p_expected_revision integer,
  p_name text,
  p_active_sprite_id uuid,
  p_palette jsonb,
  p_sprite_patches jsonb,
  p_deleted_sprite_ids uuid[]
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  current_project public.projects%rowtype;
  prospective_name text;
  prospective_active_sprite_id uuid;
  prospective_palette jsonb;
  prospective_sprites jsonb;
  patch jsonb;
  set_clause text;
  changed boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected revision must be positive' using errcode = '22023';
  end if;
  if p_sprite_patches is null
     or jsonb_typeof(p_sprite_patches) <> 'array'
     or jsonb_array_length(p_sprite_patches) > 50
     or octet_length(p_sprite_patches::text) > 4194304 then
    raise exception 'invalid sprite patches' using errcode = '22023';
  end if;
  if p_deleted_sprite_ids is null
     or cardinality(p_deleted_sprite_ids) > 50
     or exists (select 1 from unnest(p_deleted_sprite_ids) id where id is null)
     or cardinality(p_deleted_sprite_ids) <> (select count(distinct id) from unnest(p_deleted_sprite_ids) id) then
    raise exception 'invalid deleted sprite IDs' using errcode = '22023';
  end if;

  -- A patch has an ID plus at least one supplied field. Explicit JSON null is
  -- rejected: omission, not null, means unchanged.
  if exists (
    select 1
    from jsonb_array_elements(p_sprite_patches) candidate
    where jsonb_typeof(candidate) <> 'object'
       or not (candidate ? 'id')
       or (select count(*) from jsonb_object_keys(candidate)) not between 2 and 8
       or exists (
         select 1 from jsonb_object_keys(candidate) key(name)
         where name not in ('id', 'position', 'name', 'format_version', 'width', 'height', 'background', 'pixels')
       )
       or exists (select 1 from jsonb_each(candidate) field where field.value = 'null'::jsonb)
  ) then
    raise exception 'sprite patch has an invalid object shape' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_sprite_patches) candidate
    where jsonb_typeof(candidate->'id') <> 'string'
       or not ((candidate->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  )
     or (select count(distinct candidate->>'id') from jsonb_array_elements(p_sprite_patches) candidate)
        <> jsonb_array_length(p_sprite_patches) then
    raise exception 'sprite patch IDs must be valid and unique' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sprite_patches) candidate
    where (candidate->>'id')::uuid = any(p_deleted_sprite_ids)
  ) then
    raise exception 'sprite patches and deletions must be disjoint' using errcode = '22023';
  end if;

  select * into current_project
  from public.projects
  where id = p_project_id and owner_id = caller_id
  for update;
  if not found or current_project.revision <> p_expected_revision then
    raise exception 'workspace revision conflict' using errcode = '40001';
  end if;

  -- New sprites need every persisted field; existing sprites may patch any
  -- nonempty subset. Prospective validation below validates all supplied values.
  if exists (
    select 1
    from jsonb_array_elements(p_sprite_patches) candidate
    where not exists (
      select 1 from public.sprites s
      where s.project_id = p_project_id and s.id = (candidate->>'id')::uuid
    )
      and not (candidate ?& array['position', 'name', 'format_version', 'width', 'height', 'background', 'pixels'])
  ) then
    raise exception 'new sprites require all fields' using errcode = '22023';
  end if;

  prospective_name := coalesce(p_name, current_project.name);
  prospective_active_sprite_id := coalesce(p_active_sprite_id, current_project.active_sprite_id);
  prospective_palette := coalesce(p_palette, current_project.palette);

  -- Overlay sparse patches on existing rows and append fully specified new
  -- sprites. This complete prospective state is validated before any mutation.
  select coalesce(jsonb_agg(sprite order by (sprite->>'position')::integer), '[]'::jsonb)
  into prospective_sprites
  from (
    select jsonb_build_object(
      'id', s.id, 'position', s.position, 'name', s.name,
      'format_version', s.format_version, 'width', s.width, 'height', s.height,
      'background', s.background, 'pixels', s.pixels
    ) || coalesce(candidate - 'id', '{}'::jsonb) sprite
    from public.sprites s
    left join lateral (
      select value candidate
      from jsonb_array_elements(p_sprite_patches)
      where value->>'id' = s.id::text
    ) supplied on true
    where s.project_id = p_project_id
      and not (s.id = any(p_deleted_sprite_ids))
    union all
    select candidate sprite
    from jsonb_array_elements(p_sprite_patches) candidate
    where not exists (
      select 1 from public.sprites s
      where s.project_id = p_project_id and s.id = (candidate->>'id')::uuid
    )
  ) resulting;

  perform public.validate_workspace_payload(
    prospective_name,
    prospective_active_sprite_id,
    prospective_palette,
    prospective_sprites
  );

  changed := current_project.name is distinct from prospective_name
    or current_project.active_sprite_id is distinct from prospective_active_sprite_id
    or current_project.palette is distinct from prospective_palette
    or exists (
      select 1 from public.sprites s
      where s.project_id = p_project_id and s.id = any(p_deleted_sprite_ids)
    )
    or exists (
      select 1
      from jsonb_array_elements(p_sprite_patches) candidate
      left join public.sprites s
        on s.project_id = p_project_id and s.id = (candidate->>'id')::uuid
      where s.id is null
         or jsonb_build_object(
              'id', s.id, 'position', s.position, 'name', s.name,
              'format_version', s.format_version, 'width', s.width, 'height', s.height,
              'background', s.background, 'pixels', s.pixels
            ) is distinct from
            (jsonb_build_object(
              'id', s.id, 'position', s.position, 'name', s.name,
              'format_version', s.format_version, 'width', s.width, 'height', s.height,
              'background', s.background, 'pixels', s.pixels
            ) || (candidate - 'id'))
    );

  if not changed then
    return current_project.revision;
  end if;

  delete from public.sprites
  where project_id = p_project_id and id = any(p_deleted_sprite_ids);

  -- Use an allowlisted dynamic SET list so absent columns are not assigned at
  -- all. In particular, rename/reorder patches never assign the pixels column.
  for patch in select value from jsonb_array_elements(p_sprite_patches) loop
    if exists (
      select 1 from public.sprites s
      where s.project_id = p_project_id and s.id = (patch->>'id')::uuid
        and jsonb_build_object(
              'id', s.id, 'position', s.position, 'name', s.name,
              'format_version', s.format_version, 'width', s.width, 'height', s.height,
              'background', s.background, 'pixels', s.pixels
            ) is distinct from
            (jsonb_build_object(
              'id', s.id, 'position', s.position, 'name', s.name,
              'format_version', s.format_version, 'width', s.width, 'height', s.height,
              'background', s.background, 'pixels', s.pixels
            ) || (patch - 'id'))
    ) then
      set_clause := '';
      if patch ? 'position' then set_clause := set_clause || ', position = ($2->>''position'')::integer'; end if;
      if patch ? 'name' then set_clause := set_clause || ', name = $2->>''name'''; end if;
      if patch ? 'format_version' then set_clause := set_clause || ', format_version = ($2->>''format_version'')::smallint'; end if;
      if patch ? 'width' then set_clause := set_clause || ', width = ($2->>''width'')::smallint'; end if;
      if patch ? 'height' then set_clause := set_clause || ', height = ($2->>''height'')::smallint'; end if;
      if patch ? 'background' then set_clause := set_clause || ', background = $2->>''background'''; end if;
      if patch ? 'pixels' then set_clause := set_clause || ', pixels = $2->''pixels'''; end if;
      execute 'update public.sprites set ' || substr(set_clause, 3) ||
              ' where project_id = $1 and id = ($2->>''id'')::uuid'
      using p_project_id, patch;
    end if;
  end loop;

  insert into public.sprites(
    id, project_id, position, name, format_version, width, height, background, pixels
  )
  select incoming.id, p_project_id, incoming.position, incoming.name,
         incoming.format_version, incoming.width, incoming.height,
         incoming.background, incoming.pixels
  from jsonb_to_recordset(p_sprite_patches) incoming(
    id uuid, position integer, name text, format_version smallint,
    width smallint, height smallint, background text, pixels jsonb
  )
  where not exists (
    select 1 from public.sprites s
    where s.project_id = p_project_id and s.id = incoming.id
  );

  update public.projects
  set name = prospective_name,
      active_sprite_id = prospective_active_sprite_id,
      palette = prospective_palette,
      revision = revision + 1
  where id = p_project_id and owner_id = caller_id;

  return current_project.revision + 1;
end;
$$;

-- Full-snapshot compatibility for older clients. Identical rows are ignored;
-- changed rows are delegated as complete patches.
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
  deleted_ids uuid[];
begin
  if caller_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  perform public.validate_workspace_payload(p_name, p_active_sprite_id, p_palette, p_sprites);

  perform 1 from public.projects
  where id = p_project_id and owner_id = caller_id and revision = p_expected_revision
  for update;
  if not found then
    raise exception 'workspace revision conflict' using errcode = '40001';
  end if;

  select coalesce(array_agg(s.id), array[]::uuid[]) into deleted_ids
  from public.sprites s
  where s.project_id = p_project_id
    and not exists (
      select 1 from jsonb_array_elements(p_sprites) incoming
      where incoming->>'id' = s.id::text
    );

  return public.save_workspace_delta(
    p_project_id, p_expected_revision, p_name, p_active_sprite_id, p_palette,
    p_sprites, deleted_ids
  );
end;
$$;

revoke all on function public.save_workspace_delta(uuid, integer, text, uuid, jsonb, jsonb, uuid[]) from public;
revoke all on function public.save_workspace_delta(uuid, integer, text, uuid, jsonb, jsonb, uuid[]) from authenticated;
grant execute on function public.save_workspace_delta(uuid, integer, text, uuid, jsonb, jsonb, uuid[]) to authenticated;

revoke all on function public.validate_workspace_payload(text, uuid, jsonb, jsonb) from public;
revoke all on function public.validate_workspace_payload(text, uuid, jsonb, jsonb) from authenticated;
revoke all on function public.save_workspace(uuid, integer, text, uuid, jsonb, jsonb) from public;
grant execute on function public.save_workspace(uuid, integer, text, uuid, jsonb, jsonb) to authenticated;
