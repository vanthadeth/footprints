-- Footprints: public.attendance_settings() (0091) doesn't need SECURITY
-- DEFINER -- app_settings is readable by every signed-in user already -- so
-- run it as the caller (security advisor 0029).
alter function public.attendance_settings() security invoker;
