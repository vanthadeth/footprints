import { describe, expect, it } from 'vitest'
import { displayName } from '../displayName'

describe('displayName', () => {
  it('prefers a set nickname over the full name', () => {
    expect(displayName('Sokha Chan', 'Bear')).toBe('Bear')
  })

  it('trims a nickname before using it', () => {
    expect(displayName('Sokha Chan', '  Bear  ')).toBe('Bear')
  })

  it('falls back to full name when nickname is null', () => {
    expect(displayName('Sokha Chan', null)).toBe('Sokha Chan')
  })

  it('falls back to full name when nickname is omitted', () => {
    expect(displayName('Sokha Chan')).toBe('Sokha Chan')
  })

  it('falls back to full name when nickname is empty', () => {
    expect(displayName('Sokha Chan', '')).toBe('Sokha Chan')
  })

  it('falls back to full name when nickname is whitespace-only', () => {
    expect(displayName('Sokha Chan', '   ')).toBe('Sokha Chan')
  })
})
