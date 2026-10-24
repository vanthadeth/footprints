/** The IDs typed into the Google Sheet field: separated by commas, spaces or new lines; trimmed, lower-cased, without blanks or repeats. */
export function parseSheetIds(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

/** The IDs as the field shows them. */
export function formatSheetIds(ids: string[]): string {
  return ids.join(', ')
}
