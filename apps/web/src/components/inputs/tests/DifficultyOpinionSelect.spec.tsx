import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEMON_OPINIONS,
  DifficultyOpinionSelect,
  NOT_DEMON_OPINIONS,
  STAR_TO_OPINION,
} from '../DifficultyOpinionSelect'
import { difficultyFaceSrc, starCountToDifficulty } from '@/lib/gdAssets'
import { renderWithProviders } from '@/utils/testUtils'

describe('DEMON_OPINIONS', () => {
  it('offers the five demon tiers, easiest first', () => {
    expect(DEMON_OPINIONS.map((o) => o.value)).toEqual([
      'EASY',
      'MEDIUM',
      'HARD',
      'INSANE',
      'EXTREME',
    ])
  })

  // Faces are derived from the labels via the shared asset mapping, so
  // asserting that relationship would be tautological — these are the sprites
  // the picker must actually render.
  it('points each tier at its own sprite', () => {
    expect(DEMON_OPINIONS.map((o) => o.face)).toEqual([
      '/assets/gd/demon-easy.png',
      '/assets/gd/demon-medium.png',
      '/assets/gd/demon-hard.png',
      '/assets/gd/demon-insane.png',
      '/assets/gd/demon-extreme.png',
    ])
  })

  // A hardcoded path would leave this picker pointing at a 404 while every
  // other difficulty face in the app moved with a rename.
  it('agrees with the shared asset mapping', () => {
    expect(DEMON_OPINIONS.map((o) => o.face)).toEqual(
      [
        'Easy Demon',
        'Medium Demon',
        'Hard Demon',
        'Insane Demon',
        'Extreme Demon',
      ].map(difficultyFaceSrc)
    )
  })

  it('gives each tier its own face', () => {
    const faces = DEMON_OPINIONS.map((o) => o.face)

    expect(new Set(faces).size).toBe(faces.length)
  })

  // The face mapping falls back to the NA sprite for a label it cannot read,
  // so an unreadable label here would silently render five blank faces.
  it('uses no fallback face', () => {
    for (const { face } of DEMON_OPINIONS) {
      expect(face).not.toContain('difficulty-na')
    }
  })

  it('labels every tier as a demon', () => {
    for (const { label } of DEMON_OPINIONS) {
      expect(label).toContain('Demon')
    }
  })

  // The two halves are one field, so an opinion cannot be both.
  it('shares no value with the non-demon tiers', () => {
    for (const { value } of DEMON_OPINIONS) {
      expect(NOT_DEMON_OPINIONS.has(value)).toBe(false)
    }
  })
})

describe('STAR_TO_OPINION', () => {
  it('covers the full 1-9 star range the picker renders', () => {
    for (const stars of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(STAR_TO_OPINION[stars]).toBeTruthy()
    }
  })

  it('maps each star count to its own opinion', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => STAR_TO_OPINION[n])

    expect(new Set(values).size).toBe(9)
  })

  // Every star value is a non-demon opinion — that is what the "not
  // demon-worthy" path means.
  it('produces only non-demon opinions', () => {
    for (const stars of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(NOT_DEMON_OPINIONS.has(STAR_TO_OPINION[stars]!)).toBe(true)
    }
  })

  // The "Not demon-worthy" button seeds the picker at one star.
  it('has a value at the star count that button opens on', () => {
    expect(STAR_TO_OPINION[1]).toBeTruthy()
  })

  it('labels every star button with a real difficulty', () => {
    for (const stars of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(starCountToDifficulty(stars).length).toBeGreaterThan(0)
    }
  })
})

describe('NOT_DEMON_OPINIONS', () => {
  it('holds exactly the star values', () => {
    const fromStars = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => STAR_TO_OPINION[n]!)
    )

    expect(NOT_DEMON_OPINIONS).toEqual(fromStars)
  })

  // The picker uses this to decide whether to open the star row, so a demon
  // value leaking in would open it on a demon selection.
  it('rejects a demon tier', () => {
    expect(NOT_DEMON_OPINIONS.has('EXTREME')).toBe(false)
  })

  it('is non-empty', () => {
    expect(NOT_DEMON_OPINIONS.size).toBeGreaterThan(0)
  })
})

describe('DifficultyOpinionSelect', () => {
  const starRow = () => screen.queryByText('What difficulty would you give it?')

  it('offers the five demon tiers as named controls', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value={null} onChange={vi.fn()} />
    )

    for (const { label } of DEMON_OPINIONS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('presses only the selected tier', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value="HARD" onChange={vi.fn()} />
    )

    expect(
      screen.getByRole('button', { name: 'Hard Demon' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Easy Demon' })
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('emits the opinion for the tier clicked', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <DifficultyOpinionSelect value={null} onChange={onChange} />
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Extreme Demon' })
    )

    expect(onChange).toHaveBeenCalledWith('EXTREME')
  })

  it('keeps the star row behind the not-demon-worthy choice', () => {
    const { unmount } = renderWithProviders(
      <DifficultyOpinionSelect value={null} onChange={vi.fn()} />
    )
    expect(starRow()).not.toBeInTheDocument()
    unmount()

    const { unmount: unmount2 } = renderWithProviders(
      <DifficultyOpinionSelect value="EXTREME" onChange={vi.fn()} />
    )
    expect(starRow()).not.toBeInTheDocument()
    unmount2()

    renderWithProviders(
      <DifficultyOpinionSelect value={STAR_TO_OPINION[3]!} onChange={vi.fn()} />
    )
    expect(starRow()).toBeInTheDocument()
  })

  it('opens the star path at one star', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <DifficultyOpinionSelect value={null} onChange={onChange} />
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Not demon-worthy' })
    )

    expect(onChange).toHaveBeenCalledWith(STAR_TO_OPINION[1])
  })

  it('presses the not-demon-worthy button for any star value', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value={STAR_TO_OPINION[7]!} onChange={vi.fn()} />
    )

    expect(
      screen.getByRole('button', { name: 'Not demon-worthy' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('names each star button by count and difficulty', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value={STAR_TO_OPINION[1]!} onChange={vi.fn()} />
    )

    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      expect(
        screen.getByRole('button', {
          name: `${n} star ${starCountToDifficulty(n)}`,
        })
      ).toBeInTheDocument()
    }
  })

  it('emits the star opinion for the count clicked', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <DifficultyOpinionSelect value={STAR_TO_OPINION[1]!} onChange={onChange} />
    )

    await userEvent.click(
      screen.getByRole('button', {
        name: `5 star ${starCountToDifficulty(5)}`,
      })
    )

    expect(onChange).toHaveBeenCalledWith(STAR_TO_OPINION[5])
  })

  it('presses only the selected star count', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value={STAR_TO_OPINION[5]!} onChange={vi.fn()} />
    )

    expect(
      screen.getByRole('button', { name: `5 star ${starCountToDifficulty(5)}` })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: `4 star ${starCountToDifficulty(4)}` })
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('leaves the demon tiers unpressed while a star value is selected, since the two are one field', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value={STAR_TO_OPINION[5]!} onChange={vi.fn()} />
    )

    for (const { label } of DEMON_OPINIONS) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    }
  })
})
