-- Sprite IDs originate in the browser. A guest workspace can later be copied
-- into another project, retaining those IDs, so they must only be unique
-- within their parent project rather than across every project.
alter table public.sprites drop constraint sprites_pkey;
alter table public.sprites add primary key (project_id, id);
