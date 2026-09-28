# Validation

Validated on Windows 10 x64 with Node.js 24.21.0 LTS, Electron 44.4.5 and Microsoft Edge. Dependencies were checked against current registry versions and official documentation on 2026-09-28.

## Automated checks

`npm run build` passes strict TypeScript checking and produces the bundled application.

`npm test`: **24 integration tests**. These assert rendered pixel changes, not just the presence of buttons:

1. Complete initial UI with eight brushes, one layer and no runtime errors or horizontal overflow.
2. Drawing, undo and redo restore expected pixels.
3. Erasing removes pixels and undo restores them.
4. Synthetic pen pressure and tilt change the brush footprint.
5. Stroke opacity does not multiply at overlapping dabs.
6. All eight presets produce distinct raster output.
7. Layers isolate edits and honor visibility and locking; structural deletion is undoable.
8. Selection clipping and selected-region transformation.
9. Color adjustment preview, cancellation, commit and undo.
10. Project file round-trip preserves all pixels and layer metadata.
11. Invalid formats, dimensions and unsafe layer identifiers are rejected without replacing the canvas.
12. PNG export has valid dimensions and transparent output preserves alpha.
13. Switching among all six languages preserves artwork.
14. IndexedDB recovery restores the previous session.
15. Moving selected pixels leaves unselected pixels untouched.
16. At a 1040 × 681 content viewport (accounting for native window decorations), all panels and dialogs fit without scrolling in all six languages.
17. All 24 layers are reachable using page controls; resizing keeps the active layer visible.
18. Brush-size shortcuts advance at 1 and 2 px and clamp at both the 1 and 300 px limits.
19. A canceled pen stroke does not change saved pixels or add undo history.
20. A new edit after undo removes the abandoned redo branch.
21. Canceling document replacement preserves unsaved artwork.
22. Missing/duplicate layer IDs, out-of-range/null opacity and truncated PNG data cannot replace a valid project.
23. Every displayed toolbar icon is a loadable transparent PNG; the application icon is fully opaque.
24. Brush edges contain intermediate shades and the artwork display has high-quality image smoothing enabled.

## TDD regression record

The brush-size boundary test was added before changing the shortcut implementation. It failed with `Expected: 2; Received: 1` for the 1 px → increase transition. The implementation then added a minimum one-pixel step while retaining proportional increments and the existing limits. New changes should follow the same red → green → refactor cycle.

The truncated-PNG regression also failed first: Chromium accepted an incomplete PNG and the project could replace existing artwork with a blank layer. The parser now requires a complete PNG chunk stream through IEND before decoding. Raster-icon and smoothing tests failed against the old vector markup and default low-quality interpolation before the PNG migration and shared high-quality rendering context were implemented.

Tests run their own server on port 5187 with server reuse disabled, so another local application's development server cannot accidentally become the test target. The desktop harness has explicit timeouts and force-cleans only its isolated test window, even if the unsaved-work protection is active.

These are risk-based boundary and state-transition checks, not a claim that every possible environment or hardware combination has been covered.

`node scripts/desktop-smoke.mjs` passes. It launches the actual Electron application, verifies a secure context with no renderer Node access, tests save/open/PNG through the native bridge using real temporary files, confirms canceled saves preserve the dirty state, and checks canceling the unsaved-close dialog. Dialog responses are substituted in the test process only; filesystem operations use the production implementation.

The interface was also opened with agent-browser and visually inspected. No runtime errors or Vite error overlay were detected. Screenshots are in `docs/studio.png` and `docs/studio-compact-ru.png`.

The same desktop smoke check also passed against the packaged `release/win-unpacked/X Artist.exe`. The portable Windows artifact was built successfully, with the generated icon embedded, and its Authenticode status is `NotSigned`. A SHA-256 checksum accompanies the release.

## What remains unverified

- Physical Wacom, Huion, XP-Pen, Surface and other pen hardware. The implementation consumes standard Windows Ink pressure, tilt and eraser events; driver settings and hardware capabilities vary.
- Long-duration/high-resolution painting performance, low-memory systems and Windows 11 hardware coverage.
- Color-critical/print workflows. The application currently uses sRGB 8-bit Canvas 2D and does not implement ICC/CMYK color management.

## Documentation sources

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security): secure protocol, sandbox, context isolation and a narrow validated IPC bridge.
- [PointerEvent](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent): pressure, tilt, hardware pointer type and coalesced input.
- [Canvas image smoothing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality): high-quality raster interpolation in the bundled Chromium renderer, separate from input path stabilization.
- [Vite guide](https://vite.dev/guide/): current stable build tool setup.
- [Node.js releases](https://nodejs.org/en/about/previous-releases): Node 24 LTS baseline.
- [electron-builder Windows targets](https://www.electron.build/win/): portable executable packaging.
