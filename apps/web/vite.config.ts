import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import * as path from 'path'

// Source-map upload is opt-in on all three env vars being present, which in
// practice means CI (see .github/workflows/deploy-web.yml). A local `pnpm
// build` has no auth token and so skips both the upload and the maps.
//
// Emitting maps is tied to uploading them, but NOT for secrecy — this repo is
// public, so a leaked map discloses nothing that GitHub doesn't. The reasons
// are that an unuploaded map is pure deploy weight (they are large, and every
// one of them ships to S3 and CloudFront for nobody), and that Sentry resolves
// uploaded artifacts by debug id, which is the supported path and does not
// depend on the browser being able to fetch a map from the CDN.
//
// 'hidden' keeps the //# sourceMappingURL comment out of the bundles (the
// upload matches them by debug id, not by comment), and
// filesToDeleteAfterUpload removes the .map files once Sentry has them — so
// they exist only between the build and the deploy.
//
// This gate degrades rather than fails, which matters for a public repo:
// GitHub gives a fork's pull_request run no secrets, so SENTRY_AUTH_TOKEN is
// absent there and the build simply produces no maps instead of erroring.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const sentryOrg = process.env.SENTRY_ORG
const sentryProject = process.env.SENTRY_PROJECT
const uploadSourceMaps = !!(sentryAuthToken && sentryOrg && sentryProject)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    // Must come after the others — it reads the emitted bundles.
    uploadSourceMaps &&
      sentryVitePlugin({
        authToken: sentryAuthToken,
        org: sentryOrg,
        project: sentryProject,
        sourcemaps: {
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
      }),
  ],
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
