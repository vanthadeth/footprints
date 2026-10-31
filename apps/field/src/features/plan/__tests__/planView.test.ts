import { describe, expect, it } from 'vitest'
import { edgeTone, moveItem, planSegments } from '../planView'

const mk = (id: string, status: string) => ({ item_id: id, status })

describe('planView', () => {
  it('marks done, next, to do and skipped segments', () => {
    expect(planSegments([mk('a', 'done'), mk('b', 'planned'), mk('c', 'planned'), mk('d', 'skipped')])).toEqual(['done', 'next', 'todo', 'skipped'])
    expect(planSegments([mk('a', 'done')])).toEqual(['done'])
  })
  it('colours the edge by recency', () => {
    expect(edgeTone({ status: 'planned' }, 3)).toBe('ok')
    expect(edgeTone({ status: 'planned' }, 40)).toBe('warn')
    expect(edgeTone({ status: 'planned' }, 70)).toBe('bad')
    expect(edgeTone({ status: 'planned' }, null)).toBe('bad')
    expect(edgeTone({ status: 'done' }, 90)).toBe('ok')
    expect(edgeTone({ status: 'skipped' }, 3)).toBe('mute')
  })
  it('moves an item without touching the input', () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(moveItem(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveItem(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(ids, 1, 1)).toBe(ids)
    expect(moveItem(ids, 1, 9)).toBe(ids)
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })
})
