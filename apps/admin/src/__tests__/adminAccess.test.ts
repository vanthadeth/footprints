import { describe, expect, it } from 'vitest'
import { adminAccess, surveysOnlyAllows } from '../features/auth/adminAccess'

describe('adminAccess', () => {
  it('gives Super Admins everything, whatever their survey grant', () => {
    expect(adminAccess(true, null)).toBe('full')
    expect(adminAccess(true, 'any')).toBe('full')
  })

  it('lets only survey edit at All scope into the Surveys section', () => {
    expect(adminAccess(false, 'any')).toBe('surveysOnly')
    expect(adminAccess(false, 'sub')).toBe('none')
    expect(adminAccess(false, 'own')).toBe('none')
    expect(adminAccess(false, null)).toBe('none')
  })
})

describe('surveysOnlyAllows', () => {
  it('allows the Surveys section and its template pages, nothing else', () => {
    expect(surveysOnlyAllows('/surveys')).toBe(true)
    expect(surveysOnlyAllows('/surveys/templates/new')).toBe(true)
    expect(surveysOnlyAllows('/users')).toBe(false)
    expect(surveysOnlyAllows('/sync')).toBe(false)
    expect(surveysOnlyAllows('/surveyshack')).toBe(false)
    expect(surveysOnlyAllows('/')).toBe(false)
  })
})
