import { afterEach, describe, expect, it, vi } from 'vitest'
import { getInitialThemeMode, resolveTheme } from '../theme'

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') && prefersDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('resolveTheme', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resolves an explicit light/dark choice as-is, ignoring the OS setting', () => {
    mockMatchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it("resolves 'system' to whatever the OS currently prefers", () => {
    mockMatchMedia(true)
    expect(resolveTheme('system')).toBe('dark')
    mockMatchMedia(false)
    expect(resolveTheme('system')).toBe('light')
  })
})

describe('getInitialThemeMode', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('defaults to system on a first-ever visit, not a resolved light/dark guess', () => {
    expect(getInitialThemeMode()).toBe('system')
  })

  it('returns a previously persisted mode, including an explicit light/dark choice', () => {
    window.localStorage.setItem('footprints-theme', 'dark')
    expect(getInitialThemeMode()).toBe('dark')
  })

  it('falls back to system for a garbage/legacy stored value', () => {
    window.localStorage.setItem('footprints-theme', 'sepia')
    expect(getInitialThemeMode()).toBe('system')
  })
})
