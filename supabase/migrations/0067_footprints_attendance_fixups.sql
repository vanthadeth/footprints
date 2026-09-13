-- Fix-ups for 0066_footprints_attendance:
--
-- 1. CREATE OR REPLACE FUNCTION with an added parameter does NOT extend an
--    existing function in Postgres -- it creates a new, separate overload.
--    So the previous migration left the OLD 3-arg app.check_in/app.check_out
--    (and their public wrappers) alive side-by-side with the new 4-arg
--    versions. Any caller still passing exactly 3 positional args would
--    resolve to the old overload, which does not require an open attendance
--    session -- silently bypassing the "must clock in before a visit" rule.
--    Confirmed no other function/view depends on the old signatures before
--    dropping them.
--
-- 2. This environment's migration-apply role grants `anon` EXECUTE on new
--    functions by default (unlike the role that created the original
--    schema, which granted neither anon nor authenticated). Every function
--    below now matches the existing convention: anon has no access,
--    authenticated has exactly what it needs to call the public RPC chain.

drop function if exists app.check_in(uuid, numeric, numeric);
drop function if exists app.check_out(uuid, numeric, numeric);
drop function if exists public.check_in(uuid, numeric, numeric);
drop function if exists public.check_out(uuid, numeric, numeric);

revoke execute on function app.check_in(uuid, numeric, numeric, numeric) from anon;
revoke execute on function app.check_out(uuid, numeric, numeric, numeric) from anon;
revoke execute on function public.check_in(uuid, numeric, numeric, numeric) from anon;
revoke execute on function public.check_out(uuid, numeric, numeric, numeric) from anon;

revoke execute on function app.clock_in(numeric, numeric, numeric, text) from anon;
revoke execute on function app.clock_out(numeric, numeric, numeric, text) from anon;
revoke execute on function public.clock_in(numeric, numeric, numeric, text) from anon;
revoke execute on function public.clock_out(numeric, numeric, numeric, text) from anon;

revoke execute on function app.record_location_ping(uuid, numeric, numeric, numeric) from anon;
revoke execute on function public.record_location_ping(uuid, numeric, numeric, numeric) from anon;

revoke execute on function app.nearby_customers(numeric, numeric, integer) from anon;
revoke execute on function public.nearby_customers(numeric, numeric, integer) from anon;

-- app._close_visit is called from inside check_out/clock_out/record_location_ping,
-- which run as SECURITY INVOKER, so `authenticated` needs EXECUTE on it too;
-- only anon is revoked.
revoke execute on function app._close_visit(uuid, numeric, numeric, numeric, text) from anon;

-- guard_attendance_edit is a trigger function; it should never be callable
-- as a plain RPC (matches guard_visit_edit, which already has no such grant).
revoke execute on function public.guard_attendance_edit() from anon, authenticated, public;
