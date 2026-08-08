-- The workspace RPC replaces every sprite atomically. As SECURITY INVOKER,
-- the delete can be filtered by sprite RLS while the following insert still
-- sees the original primary keys. Keep authorization inside the functions,
-- then run the replacement as the function owner.

create or replace function public.create_workspace(
  p_project_id uuid,
  p_name text,
  p_active_sprite_id uuid,
  p_palette jsonb,
  p_sprites jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  insert into public.projects(id, owner_id, name, active_sprite_id, palette)
  values (p_project_id, (select auth.uid()), p_name, p_active_sprite_id, p_palette);

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
  current_revision integer;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select revision into current_revision
  from public.projects
  where id = p_project_id and owner_id = (select auth.uid())
  for update;

  if current_revision is null or current_revision <> p_expected_revision then
    raise exception 'workspace revision conflict' using errcode = '40001';
  end if;

  update public.projects
  set name = p_name,
      active_sprite_id = p_active_sprite_id,
      palette = p_palette,
      revision = revision + 1
  where id = p_project_id;

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

revoke all on function public.create_workspace(uuid, text, uuid, jsonb, jsonb) from public;
revoke all on function public.save_workspace(uuid, integer, text, uuid, jsonb, jsonb) from public;
grant execute on function public.create_workspace(uuid, text, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_workspace(uuid, integer, text, uuid, jsonb, jsonb) to authenticated;
