import { describe, expect, it } from 'vitest'
import {
  MOBILE_OVERFLOW_KEYS,
  NAV_ITEMS,
  isBarItemActive,
  isRailItemActive,
  navItemByKey,
} from '../navConfig'

const item = (key: string) => navItemByKey(key)

describe('NAV_ITEMS', () => {
  it('gives every destination a unique key', () => {
    const keys = NAV_ITEMS.map((n) => n.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('labels and icons every destination', () => {
    for (const n of NAV_ITEMS) {
      expect(n.label.length).toBeGreaterThan(0)
      expect(n.icon).toBeTruthy()
    }
  })

  // A route with no destination could never be navigated to, and the nav
  // renders it as a dead cell.
  it('gives every enabled destination somewhere to go', () => {
    for (const n of NAV_ITEMS.filter((i) => i.status === 'enabled')) {
      expect(n.to).toBeTruthy()
    }
  })

  // Planned tabs stay visible rather than hidden, which is what makes the
  // disabled status meaningful.
  it('keeps the planned destinations listed', () => {
    expect(NAV_ITEMS.some((n) => n.status === 'disabled')).toBe(true)
  })

  it('routes every destination from the root', () => {
    for (const n of NAV_ITEMS) {
      if (n.to) expect(n.to.startsWith('/')).toBe(true)
    }
  })
})

describe('navItemByKey', () => {
  it('finds a destination by key', () => {
    expect(navItemByKey('list').label).toBe('List')
  })

  // The nav is a fixed table, so a miss is a typo in the caller rather than a
  // runtime condition — better a loud failure than a silently missing tab.
  it('throws on a key that is not in the table', () => {
    expect(() => navItemByKey('nonsense')).toThrow('Unknown nav key: nonsense')
  })
})

describe('MOBILE_OVERFLOW_KEYS', () => {
  it('names only real destinations', () => {
    for (const key of MOBILE_OVERFLOW_KEYS) {
      expect(() => navItemByKey(key)).not.toThrow()
    }
  })

  // The bar has four fixed slots (List, Ranking, Search, More) plus the FAB;
  // everything else has to be reachable through the More sheet or it becomes
  // unreachable on mobile entirely.
  it('leaves no destination unreachable on mobile', () => {
    const inBar = ['list', 'ranking', 'search']
    const reachable = new Set<string>([...inBar, ...MOBILE_OVERFLOW_KEYS])

    expect(NAV_ITEMS.filter((n) => !reachable.has(n.key))).toEqual([])
  })

  it('does not push a bar tab into the overflow sheet as well', () => {
    for (const key of ['list', 'ranking', 'search']) {
      expect(MOBILE_OVERFLOW_KEYS).not.toContain(key)
    }
  })
})

// The rail stays lit while the user is drilled into a sub-page, so they can
// see which section they are inside.
describe('isRailItemActive', () => {
  it('lights the destination the user is on', () => {
    expect(isRailItemActive(item('list'), '/list')).toBe(true)
  })

  it('stays lit on a detail sub-page', () => {
    expect(isRailItemActive(item('collections'), '/collections/abc')).toBe(true)
  })

  it('does not light a different destination', () => {
    expect(isRailItemActive(item('list'), '/ranking')).toBe(false)
  })

  // /listing is not inside /list — matching on a bare prefix would light the
  // wrong tab for any route whose name merely starts the same way.
  it('does not light a route that merely shares a prefix', () => {
    expect(isRailItemActive(item('list'), '/listing')).toBe(false)
  })

  // The Global Level Page is part of the Search tab but lives on its own
  // route, so it has to be claimed explicitly.
  it('lights Search for the Global Level Page', () => {
    expect(isRailItemActive(item('search'), '/levels/128')).toBe(true)
  })

  it('never lights a destination with nowhere to go', () => {
    expect(isRailItemActive(item('stats'), '/stats')).toBe(false)
  })
})

// The bottom bar deliberately shows no active tab once drilled into a detail
// sub-page — that page's own back affordance says where the user is.
describe('isBarItemActive', () => {
  it('lights the destination the user is on', () => {
    expect(isBarItemActive(item('list'), '/list')).toBe(true)
  })

  it('goes dark on a detail sub-page', () => {
    expect(isBarItemActive(item('list'), '/list/abc')).toBe(false)
  })

  // The one place the two rules deliberately disagree.
  it('differs from the rail exactly on sub-pages', () => {
    expect(isRailItemActive(item('list'), '/list/abc')).toBe(true)
    expect(isBarItemActive(item('list'), '/list/abc')).toBe(false)
  })

  // activePrefixes still counts — the Global Level Page is the Search tab, not
  // a sub-page of it.
  it('lights Search for the Global Level Page', () => {
    expect(isBarItemActive(item('search'), '/levels/128')).toBe(true)
  })

  it('does not light a different destination', () => {
    expect(isBarItemActive(item('ranking'), '/list')).toBe(false)
  })

  it('lights at most one bar tab at a time', () => {
    const tabs = ['list', 'ranking', 'search'].map(item)

    for (const path of ['/list', '/ranking', '/search', '/levels/128']) {
      expect(tabs.filter((t) => isBarItemActive(t, path))).toHaveLength(1)
    }
  })

  it('lights nothing on a page outside the nav', () => {
    const tabs = ['list', 'ranking', 'search'].map(item)

    expect(tabs.some((t) => isBarItemActive(t, '/settings'))).toBe(false)
  })
})
