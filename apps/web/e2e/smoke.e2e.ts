import { expect, test } from './testBase'

// The harness's own test: it asserts nothing about product behaviour that a
// component test could cover, only the three things unique to this suite —
// the injected Cognito session is accepted, the deployed API answers over the
// real wire, and globalSetup's reset left the user in the baseline state.
//
// If this file fails, no other spec's failure means anything.

test.describe('e2e harness', () => {
  test('boots already authenticated and lands on the list', async ({
    page,
  }) => {
    // `/` is the unauthenticated landing page and redirects signed-in users to
    // their list, so arriving there proves both the Amplify session was read
    // and GET /v1/me succeeded — `_authenticated` renders nothing until it has.
    await page.goto('/')

    await expect(page).toHaveURL(/\/list$/)
    await expect(
      page.getByRole('navigation', { name: 'Primary' })
    ).toBeVisible()
  })

  test('starts from the reset baseline: built-in collections only', async ({
    page,
  }) => {
    await page.goto('/collections')

    const pinned = page.getByRole('region', { name: 'Pinned collections' })
    await expect(
      pinned.getByRole('link', { name: /Want to Beat/ })
    ).toBeVisible()
    await expect(pinned.getByRole('link', { name: /^Favorites/ })).toBeVisible()
    await expect(
      pinned.getByRole('link', { name: /Least Favorites/ })
    ).toBeVisible()

    // The reset drops every custom collection, so the only tile left in this
    // section is the create card. A leftover here means the reset did not run.
    const yours = page.getByRole('region', { name: 'Your collections' })
    await expect(yours.getByRole('link')).toHaveCount(0)
  })
})
