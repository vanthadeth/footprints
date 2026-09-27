import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type UntypedRpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: PostgrestError | null }>

/**
 * Calls an RPC by name and returns its data as T. For RPCs whose generated
 * types are wrong for us (the generator marks every returned column
 * non-null) the caller declares the real shape instead -- same reason the
 * plan/coverage services hand-write their row types.
 */
export async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc
  const { data, error } = await rpc(fn, args)
  if (error) throw error
  return data as T
}
