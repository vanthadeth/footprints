import { describe, expect, it } from 'vitest'
import { formatSheetIds, parseSheetIds } from '../sheetIds'

describe('sheet IDs field', () => {
  it('reads commas, spaces and new lines, trims, lower-cases and drops blanks and repeats', () => {
    expect(parseSheetIds('Seyha, 9AF927A9;\n seyha  pheakdey,')).toEqual(['seyha', '9af927a9', 'pheakdey'])
    expect(parseSheetIds('')).toEqual([])
    expect(parseSheetIds(' , ; ')).toEqual([])
  })

  it('shows them separated by commas', () => {
    expect(formatSheetIds(['seyha', '9af927a9'])).toBe('seyha, 9af927a9')
    expect(formatSheetIds([])).toBe('')
  })
})
