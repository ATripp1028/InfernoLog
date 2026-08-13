import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { DifficultyFace } from '../DifficultyFace'
import { renderWithProviders } from '@/utils/testUtils'

/** The showcase glow is the only layer sourced from a `bg-*` sprite. */
const glow = (c: HTMLElement) => c.querySelector('img[src*="bg-"]')

describe('DifficultyFace', () => {
  it('labels the face with the difficulty it is showing', () => {
    renderWithProviders(<DifficultyFace difficulty="Extreme Demon" />)

    expect(screen.getByAltText('Extreme Demon')).toBeInTheDocument()
  })

  it('falls back to a generic label when the difficulty is unknown', () => {
    renderWithProviders(<DifficultyFace difficulty={null} />)

    expect(screen.getByAltText('Difficulty')).toBeInTheDocument()
  })

  it('renders a glow layer only for a level that has one', () => {
    const { container: plain, unmount } = renderWithProviders(
      <DifficultyFace difficulty="Insane" featured={false} epicValue={0} />
    )
    expect(glow(plain)).toBeNull()
    unmount()

    const { container: featured } = renderWithProviders(
      <DifficultyFace difficulty="Insane" featured epicValue={0} />
    )
    expect(glow(featured)).toBeInTheDocument()
  })

  it('marks a rated non-demon with the star, and an unrated one without', () => {
    const { unmount } = renderWithProviders(
      <DifficultyFace difficulty="Insane" rated />
    )
    expect(screen.getByAltText('Rated')).toBeInTheDocument()
    unmount()

    renderWithProviders(<DifficultyFace difficulty="Insane" rated={false} />)
    expect(screen.queryByAltText('Rated')).not.toBeInTheDocument()
  })

  it('leaves demon faces starless even when rated, since the face already says so', () => {
    renderWithProviders(<DifficultyFace difficulty="Extreme Demon" rated />)

    expect(screen.queryByAltText('Rated')).not.toBeInTheDocument()
  })

  it('sizes the box to the requested px', () => {
    const { container } = renderWithProviders(
      <DifficultyFace difficulty="Insane" size={48} />
    )

    expect(container.firstElementChild).toHaveStyle({
      width: '48px',
      height: '48px',
    })
  })
})
