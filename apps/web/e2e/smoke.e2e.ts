import { expect, test } from './testBase'

// The harness's own test: it asserts nothing about product behaviour that a
// component test could cover, only the three things unique to this suite —
// the injected Cognito session is accepted, the deployed API answers over the
// real wire, and globalSetup's reset left the user in the baseline state.
//
// If this file fails, no other spec's failure means anything.

test.describe('e2e harness', () => {
  test('boots already authenticated and lands on the log', async ({ page }) => {
    // `/` is the unauthenticated landing page and redirects signed-in users to
    // their log, so arriving there proves both the Amplify session was read
    // and GET /v1/me succeeded — `_authenticated` renders nothing until it has.
    await page.goto('/')

    await expect(page).toHaveURL(/\/log$/)
    await expect(
      page.getByRole('navigation', { name: 'Primary' })
    ).toBeVisible()
  })

  test('serves the built-in collections over the wire', async ({ page }) => {
    await page.goto('/collections')

    // The three collections every user is created with, read from the real
    // API. Deliberately no assertion about how many *custom* collections there
    // are: spec files run in alphabetical order, so this one runs after the
    // completion specs, and anything it claimed about a pristine database
    // would be a claim about their leftovers instead. That the reset ran at
    // all is already guaranteed — globalSetup fails the run if it did not.
    const pinned = page.getByRole('region', { name: 'Pinned collections' })
    await expect(
      pinned.getByRole('link', { name: /Want to Beat/ })
    ).toBeVisible()
    await expect(pinned.getByRole('link', { name: /^Favorites/ })).toBeVisible()
    await expect(
      pinned.getByRole('link', { name: /Least Favorites/ })
    ).toBeVisible()
  })
})
