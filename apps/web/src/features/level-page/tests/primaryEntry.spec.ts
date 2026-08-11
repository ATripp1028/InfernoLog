import { describe, expect, it } from 'vitest'
import { findPrimaryProgressUpdateId } from '../primaryEntry'
import { levelPageData, progressUpdate } from './fixtures'

describe('findPrimaryProgressUpdateId', () => {
  // What the FAB's "Edit this entry" targets when it is not scoped to one
  // Timeline card. Completion first — that is the entry a user means.
  it('prefers the completion', () => {
    const data = levelPageData({
      progressUpdates: [
        progressUpdate({ progressUpdateId: 'newest', kind: 'PROGRESS' }),
        progressUpdate({
          progressUpdateId: 'the-completion',
          kind: 'COMPLETION',
        }),
        progressUpdate({ progressUpdateId: 'older', kind: 'PROGRESS' }),
      ],
    })

    expect(findPrimaryProgressUpdateId(data)).toBe('the-completion')
  })

  // The API returns progressUpdates loggedAt-desc, so index 0 is the newest.
  it('falls back to the most recent entry', () => {
    const data = levelPageData({
      progressUpdates: [
        progressUpdate({ progressUpdateId: 'newest' }),
        progressUpdate({ progressUpdateId: 'older' }),
      ],
    })

    expect(findPrimaryProgressUpdateId(data)).toBe('newest')
  })

  it('treats a drop as an ordinary entry for this purpose', () => {
    const data = levelPageData({
      progressUpdates: [
        progressUpdate({ progressUpdateId: 'the-drop', kind: 'DROP' }),
      ],
    })

    expect(findPrimaryProgressUpdateId(data)).toBe('the-drop')
  })

  it('prefers a completion over a more recent drop', () => {
    const data = levelPageData({
      progressUpdates: [
        progressUpdate({ progressUpdateId: 'the-drop', kind: 'DROP' }),
        progressUpdate({
          progressUpdateId: 'the-completion',
          kind: 'COMPLETION',
        }),
      ],
    })

    expect(findPrimaryProgressUpdateId(data)).toBe('the-completion')
  })

  // Null is what stops the FAB action from opening an editor on nothing.
  it('reports nothing for a level with no logged entries', () => {
    expect(findPrimaryProgressUpdateId(levelPageData())).toBeNull()
  })
})
