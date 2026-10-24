import { describe, expect, it } from 'vitest'
import { SECTIONS } from '../sections'

describe('admin sections', () => {
  it('covers the four admin areas and the components preview, with unique paths', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(['User management', 'Data sync', 'Company settings', 'System settings', 'Components'])
    expect(new Set(SECTIONS.map((s) => s.path)).size).toBe(SECTIONS.length)
  })
})
