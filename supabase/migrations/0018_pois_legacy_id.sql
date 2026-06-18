-- pois holds app-generated string ids (poiStore: 'poi'+base36...), not UUIDs.
-- Add legacy_id to carry the app id (matches the pattern on customers/suppliers/etc.).
alter table public.pois add column if not exists legacy_id text unique;
