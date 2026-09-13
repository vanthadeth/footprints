-- The previous fix-up revoked EXECUTE from `anon` specifically, but these
-- functions were created with EXECUTE granted to PUBLIC (the pseudo-role
-- meaning every role, anon included) -- so anon still had access by
-- inheritance. Revoke from PUBLIC (which removes it for every role that
-- doesn't have its own separate grant) and then explicitly (re-)grant
-- EXECUTE to `authenticated`, matching the rest of this codebase's
-- convention where every RPC is anon=false / authenticated=true.
--
-- Verified after applying: has_function_privilege shows anon=false,
-- authenticated=true for every function below, and get_advisors reports no
-- new findings beyond what already existed before this feature.

revoke execute on function app.check_in(uuid, numeric, numeric, numeric) from public;
revoke execute on function app.check_out(uuid, numeric, numeric, numeric) from public;
revoke execute on function public.check_in(uuid, numeric, numeric, numeric) from public;
revoke execute on function public.check_out(uuid, numeric, numeric, numeric) from public;

revoke execute on function app.clock_in(numeric, numeric, numeric, text) from public;
revoke execute on function app.clock_out(numeric, numeric, numeric, text) from public;
revoke execute on function public.clock_in(numeric, numeric, numeric, text) from public;
revoke execute on function public.clock_out(numeric, numeric, numeric, text) from public;

revoke execute on function app.record_location_ping(uuid, numeric, numeric, numeric) from public;
revoke execute on function public.record_location_ping(uuid, numeric, numeric, numeric) from public;

revoke execute on function app.nearby_customers(numeric, numeric, integer) from public;
revoke execute on function public.nearby_customers(numeric, numeric, integer) from public;

revoke execute on function app._close_visit(uuid, numeric, numeric, numeric, text) from public;

grant execute on function app.check_in(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function app.check_out(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.check_in(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.check_out(uuid, numeric, numeric, numeric) to authenticated;

grant execute on function app.clock_in(numeric, numeric, numeric, text) to authenticated;
grant execute on function app.clock_out(numeric, numeric, numeric, text) to authenticated;
grant execute on function public.clock_in(numeric, numeric, numeric, text) to authenticated;
grant execute on function public.clock_out(numeric, numeric, numeric, text) to authenticated;

grant execute on function app.record_location_ping(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.record_location_ping(uuid, numeric, numeric, numeric) to authenticated;

grant execute on function app.nearby_customers(numeric, numeric, integer) to authenticated;
grant execute on function public.nearby_customers(numeric, numeric, integer) to authenticated;

grant execute on function app._close_visit(uuid, numeric, numeric, numeric, text) to authenticated;
