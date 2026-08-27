All images in the **/apps/web/public/assets/gd** directory are sourced from the **GJ_GameSheet02-uhd.png**, **GJ_GameSheet03-uhd.png**, and **GJ_GameSheet-uhd.png** spritesheets in the resources folder in the game files and extracted using GD Colon's [Geometry Dash Spritesheet Splitter](https://gdcolon.com/gdsplitter/).

If you wish to extract these sprites yourself, follow the following steps:

1. Open the GD game files
2. Open the **Resources** directory
3. Pick the sprite file in the folder.
4. Upload the sprite sheet and the .plist file (will be named the same as the spritesheet, like **GJ_GameSheet02-uhd.plist** for **GJ_GameSheet02-uhd.png**).
5. You may now download one sprite or a zip file containing all of them.

## Landing Page Screenshots

The **/apps/web/public/assets/infernolog/** directory holds real product screenshots used on the unauthenticated marketing landing page (`/`). They are split by viewport:

```
/apps/web/public/assets/infernolog/
 ├── desktop/   completion-logging-modal, progress-timeline, list-page,
 │              ranking-page, import-conflict, completion-privacy
 └── mobile/    list-page, ranking-page, privacy-toggle
```

Two sets exist because the Log, demon list, and privacy-toggle shots are **captured natively at each viewport** rather than scaled from one source — those three don't survive being scaled down from the desktop layout. The desktop `completion-logging-modal`, `progress-timeline`, and `import-conflict` shots are reused on mobile (scaled down whole, never cropped), so they have no separate mobile capture. The landing page swaps between the two sets with a `<picture>` element / responsive layout. See the "Landing Page" Figma frames for exact per-viewport sizing.

## Art

The favicon was made by me in Inkscape and formatted using https://realfavicongenerator.net/.
