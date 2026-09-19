import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEMON_OPINIONS,
  DifficultyOpinionSelect,
} from '../DifficultyOpinionSelect'
import { difficultyFaceSrc } from '@/lib/gdAssets'
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

  // One field: "not demon-worthy" is a sixth value, not a second axis.
  it('does not carry the not-demon-worthy value', () => {
    expect(DEMON_OPINIONS.map((o) => o.value)).not.toContain('NOT_DEMON_WORTHY')
  })
})

describe('DifficultyOpinionSelect', () => {
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

    expect(screen.getByRole('button', { name: 'Hard Demon' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Easy Demon' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('emits the opinion for the tier clicked', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <DifficultyOpinionSelect value={null} onChange={onChange} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Extreme Demon' }))

    expect(onChange).toHaveBeenCalledWith('EXTREME')
  })

  it('presses the not-demon-worthy button when it is the answer', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value="NOT_DEMON_WORTHY" onChange={vi.fn()} />
    )

    expect(
      screen.getByRole('button', { name: 'Not demon-worthy' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('emits the not-demon-worthy value when that button is clicked', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <DifficultyOpinionSelect value={null} onChange={onChange} />
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Not demon-worthy' })
    )

    expect(onChange).toHaveBeenCalledWith('NOT_DEMON_WORTHY')
  })

  it('leaves the demon tiers unpressed while not-demon-worthy is the answer, since the two are one field', () => {
    renderWithProviders(
      <DifficultyOpinionSelect value="NOT_DEMON_WORTHY" onChange={vi.fn()} />
    )

    for (const { label } of DEMON_OPINIONS) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    }
  })
})
