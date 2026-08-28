import { describe, expect, it } from 'vitest'
import { LOGGING_ACTIONS } from '../loggingActions'

describe('LOGGING_ACTIONS', () => {
  // The FAB renders actions[0] as its own button, so completion leading is
  // load-bearing rather than cosmetic.
  it('puts logging a completion first', () => {
    expect(LOGGING_ACTIONS[0]).toMatchObject({
      key: 'completion',
      path: 'completion',
    })
  })

  it('declares each action exactly once', () => {
    const keys = LOGGING_ACTIONS.map((a) => a.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every action a label and an icon', () => {
    for (const action of LOGGING_ACTIONS) {
      expect(action.label).toBeTruthy()
      expect(action.icon).toBeTruthy()
    }
  })

  it('offers all three logging paths', () => {
    const paths = LOGGING_ACTIONS.map((a) => a.path).filter(Boolean)

    expect(paths).toEqual(['completion', 'progress', 'drop'])
  })

  // The two collection actions open dialogs rather than the logging flow, so
  // they carry no path.
  it('leaves the collection actions pathless', () => {
    const pathless = LOGGING_ACTIONS.filter((a) => !a.path).map((a) => a.key)

    expect(pathless).toEqual(['want-to-beat', 'add-to-list'])
  })
})
