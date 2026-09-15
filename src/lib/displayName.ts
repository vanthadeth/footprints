/**
 * The name shown for a person throughout the app: their nickname when
 * they've set one (trimmed, so whitespace-only doesn't count), their full
 * name otherwise. Two plain string args rather than an object so it works
 * uniformly against both snake_case DB rows (profile.full_name/nickname)
 * and the camelCase service types (fullName/nickname) without a shared
 * interface.
 */
export function displayName(fullName: string, nickname?: string | null): string {
  const trimmed = nickname?.trim()
  return trimmed || fullName
}
