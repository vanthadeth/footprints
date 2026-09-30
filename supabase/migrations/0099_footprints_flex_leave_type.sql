-- Footprints: a leave type for flexible days off (0100). Added on its own
-- because a new enum value can't be used in the transaction that adds it.
alter type public.leave_type add value if not exists 'flex';
comment on type public.leave_type is 'Leave categories: annual/sick are quota-tracked per year (leave_balance_summary), unpaid is uncapped, flex is a flexible day off taken from the per-cycle weekend allowance of people on Flexible (travel) days off (0100).';
