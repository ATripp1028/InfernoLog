import { describe, expect, it } from 'vitest'
import { formatRunInputValue, parseRunInput } from '../runParsing'

/** The parse result, narrowed to `ok`. */
const ok = (raw: string) => {
  const result = parseRunInput(raw)
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}`)
  return { from: result.from, to: result.to }
}

/** The parse result, narrowed to `error`. */
const err = (raw: string) => {
  const result = parseRunInput(raw)
  if (result.kind !== 'error')
    throw new Error(`expected error, got ${result.kind}`)
  return result
}

describe('parseRunInput', () => {
  describe('a single number', () => {
    // The shorthand the community already uses: "63" means a run that
    // reached 63% from the start.
    it('reads a bare number as a run from zero', () => {
      expect(ok('63')).toEqual({ from: 0, to: 63 })
    })

    it.each(['63%', ' 63 ', ' 63 % '])('accepts %s', (raw) => {
      expect(ok(raw)).toEqual({ from: 0, to: 63 })
    })

    it('accepts exactly 100', () => {
      expect(ok('100')).toEqual({ from: 0, to: 100 })
    })

    it('rejects a percentage over 100', () => {
      expect(err('101').message).toContain('0–100')
    })

    // A run that got nowhere is not a run — the field wants how far it reached.
    it('rejects zero with an explanation', () => {
      expect(err('0').message).toContain("0% isn't a run")
    })
  })

  describe('a range', () => {
    it('reads a range as a run that started partway through', () => {
      expect(ok('52-92')).toEqual({ from: 52, to: 92 })
    })

    // Whatever dash the user's keyboard or phone produced.
    it.each(['52-92', '52–92', '52—92'])('accepts the dash in %s', (raw) => {
      expect(ok(raw)).toEqual({ from: 52, to: 92 })
    })

    it.each(['52 - 92', '52% - 92%', '  52%-92  '])(
      'tolerates the spacing in %s',
      (raw) => {
        expect(ok(raw)).toEqual({ from: 52, to: 92 })
      }
    )

    it('accepts a range starting at zero', () => {
      expect(ok('0-92')).toEqual({ from: 0, to: 92 })
    })

    it.each(['101-105', '52-101'])('rejects %s as out of range', (raw) => {
      expect(err(raw).message).toContain('0–100')
    })

    // A zero-width range is the single-number case written the long way.
    it('points a same-start-and-end range at the simpler form', () => {
      expect(err('50-50').message).toContain('enter just one number')
    })
  })

  // A backwards range has one obvious correction, so the error carries it as
  // a one-click fix rather than only telling the user off.
  describe('a backwards range', () => {
    it('is rejected', () => {
      expect(err('92-52').message).toContain('high-to-low')
    })

    it('offers the swap as a fix', () => {
      expect(err('92-52').fix).toEqual({
        label: 'Swap to 52–92',
        value: '52-92',
      })
    })

    it('offers a fix that parses cleanly', () => {
      expect(ok(err('92-52').fix!.value)).toEqual({ from: 52, to: 92 })
    })

    // Out of range is checked first — there is no sensible swap to offer for
    // a value that cannot exist either way round.
    it('reports an out-of-range backwards pair as out of range, with no fix', () => {
      const result = err('105-52')

      expect(result.message).toContain('0–100')
      expect(result.fix).toBeUndefined()
    })
  })

  describe('input it cannot read', () => {
    it.each([
      ['', 'empty'],
      ['   ', 'empty'],
    ] as const)('reports %p as %s rather than an error', (raw, kind) => {
      expect(parseRunInput(raw).kind).toBe(kind)
    })

    it.each([
      'abc',
      '52 to 92',
      '52..92',
      '1-2-3',
      '52-',
      '-92',
      '5.5',
      '1234',
    ])('rejects %p with readable copy', (raw) => {
      expect(err(raw).message).toContain("Couldn't read that")
    })

    // Never throws — every rejection is a result the field can render.
    it.each(['', '💀', '99999999999999', '-', '%%%'])(
      'never throws on %p',
      (raw) => {
        expect(() => parseRunInput(raw)).not.toThrow()
      }
    )
  })
})

describe('formatRunInputValue', () => {
  it('renders a stored range as the range shorthand', () => {
    expect(formatRunInputValue(null, 52, 92)).toBe('52-92')
  })

  it('renders a stored percentage as a bare number', () => {
    expect(formatRunInputValue(63, null, null)).toBe('63')
  })

  // The range is the more specific record, so it wins when both are stored.
  it('prefers the range when the entry carries both', () => {
    expect(formatRunInputValue(92, 52, 92)).toBe('52-92')
  })

  it('needs both ends before it will render a range', () => {
    expect(formatRunInputValue(63, 52, null)).toBe('63')
    expect(formatRunInputValue(63, null, 92)).toBe('63')
  })

  it('rounds a fractional percentage, since the box takes whole numbers', () => {
    expect(formatRunInputValue(62.6, null, null)).toBe('63')
  })

  it('renders an empty box for an entry with no run at all', () => {
    expect(formatRunInputValue(null, null, null)).toBe('')
  })

  // Round-tripping is what seeds the edit modal: whatever was stored has to
  // come back as text the parser accepts.
  it.each([
    [null, 52, 92],
    [63, null, null],
    [100, null, null],
  ] as const)(
    'round-trips (%s, %s, %s) through the parser',
    (pct, from, to) => {
      const text = formatRunInputValue(pct, from, to)

      expect(ok(text)).toEqual({
        from: from ?? 0,
        to: to ?? pct!,
      })
    }
  )
})
