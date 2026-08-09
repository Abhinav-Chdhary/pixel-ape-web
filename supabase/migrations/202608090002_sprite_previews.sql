-- Private workspace thumbnails are derived by the database from the canonical
-- sprite pixels. The browser never writes preview fields directly.
alter table public.sprites
  add column preview_width smallint,
  add column preview_height smallint,
  add column preview_pixels jsonb;

create or replace function public.make_sprite_preview(
  p_pixels jsonb,
  p_width smallint,
  p_height smallint
) returns table(preview_width smallint, preview_height smallint, preview_pixels jsonb)
language plpgsql immutable strict set search_path = '' as $$
declare
  sample_scale integer;
begin
  sample_scale := greatest(1, ceil(greatest(p_width::integer, p_height::integer) / 64.0)::integer);
  preview_width := ceil(p_width::numeric / sample_scale)::smallint;
  preview_height := ceil(p_height::numeric / sample_scale)::smallint;

  select jsonb_agg(
    p_pixels -> (
      least(p_height::integer - 1, y * sample_scale) * p_width::integer
      + least(p_width::integer - 1, x * sample_scale)
    )
    order by y, x
  ) into preview_pixels
  from generate_series(0, preview_height::integer - 1) as y
  cross join generate_series(0, preview_width::integer - 1) as x;

  return next;
end;
$$;

create or replace function public.set_sprite_preview()
returns trigger language plpgsql set search_path = '' as $$
begin
  select preview_width, preview_height, preview_pixels
  into new.preview_width, new.preview_height, new.preview_pixels
  from public.make_sprite_preview(new.pixels, new.width, new.height);
  return new;
end;
$$;

create trigger sprites_set_preview
before insert or update of pixels, width, height on public.sprites
for each row execute function public.set_sprite_preview();

-- Run an update that invokes the trigger for all pre-existing sprites.
update public.sprites set pixels = pixels;

alter table public.sprites
  alter column preview_width set not null,
  alter column preview_height set not null,
  alter column preview_pixels set not null,
  add constraint sprites_preview_width_bounds check (preview_width between 1 and 64),
  add constraint sprites_preview_height_bounds check (preview_height between 1 and 64),
  add constraint sprites_preview_pixels_valid check (public.valid_pixel_array(preview_pixels, preview_width::integer * preview_height::integer));
