import { PermissionsPage } from '@footprints/shared/pages/PermissionsPage'

/** Roles › Permissions: the shared permissions editor, laid out for the wider admin canvas with its save bar clear of the sidebar. */
export function PermissionsTab() {
  return <PermissionsPage className="max-w-4xl space-y-3.5 pb-40" saveBarClass="md:left-64" />
}
