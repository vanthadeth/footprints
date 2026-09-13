-- Enable Supabase Realtime (postgres_changes) for the tables Fleet needs to
-- watch live. Nothing was registered for Realtime in this project before
-- this migration (supabase_realtime publication was empty), so this is
-- purely additive -- it does not change any existing behavior, only makes
-- change events available to subscribers. RLS on both tables already
-- restricts who receives which row's events (own/sub/any per app.can),
-- so this does not widen visibility beyond what the REST API already allows.

alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.visits;
