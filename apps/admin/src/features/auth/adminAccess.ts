/**
 * What a signed-in person may open in the admin app.
 *   full        -- Super Admins: everything.
 *   surveysOnly -- not a Super Admin, but survey edit at All scope (can build
 *                  survey templates): the Surveys section and nothing else.
 *   none        -- everyone else.
 * This only decides which screens are shown; RLS and app.can() remain the
 * real enforcement on every query.
 */
export type AdminAccess = 'full' | 'surveysOnly' | 'none'

export function adminAccess(isSuperAdmin: boolean, surveyEditScope: 'own' | 'sub' | 'any' | null): AdminAccess {
  if (isSuperAdmin) return 'full'
  return surveyEditScope === 'any' ? 'surveysOnly' : 'none'
}

/** Paths a surveys-only person may stay on. */
export function surveysOnlyAllows(pathname: string): boolean {
  return pathname === '/surveys' || pathname.startsWith('/surveys/')
}
