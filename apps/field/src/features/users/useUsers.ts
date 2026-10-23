import { useCallback, useEffect, useState } from 'react'
import { usersService, type ManagedUser, type Option } from './usersService'

interface State {
  users: ManagedUser[]
  roles: Option[]
  departments: Option[]
  loading: boolean
  error: string | null
}

/** Loads the Users screen's data: the manageable-user list plus the role/department options its forms need. */
export function useUsers(): State & { refresh: () => void } {
  const [state, setState] = useState<State>({ users: [], roles: [], departments: [], loading: true, error: null })
  const [nonce, setNonce] = useState(0)

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [users, roles, departments] = await Promise.all([
        usersService.list(),
        usersService.listRoles(),
        usersService.listDepartments(),
      ])
      setState({ users, roles, departments, loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Failed to load users.' }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, nonce])

  return { ...state, refresh: () => setNonce((n) => n + 1) }
}
