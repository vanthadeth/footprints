import { useCan } from '@footprints/shared/features/permissions/PermissionsContext'
import { TeamHomePage } from './TeamHomePage'
import { TeamOverviewPage } from './TeamOverviewPage'

/** Team tab: the Team overview for anyone who can see the team map, the approvals-first home for the rest. */
export function TeamTab() {
  return useCan('team_map') ? <TeamOverviewPage /> : <TeamHomePage />
}
