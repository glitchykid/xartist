# Validation

Validated on Windows 10 x64 with Node.js 24.21.0 LTS, Electron 44.4.5 and Microsoft Edge. Dependencies were checked against current registry versions and official documentation on 2026-09-28.

## Automated checks

`npm run build` passes strict TypeScript checking and produces the bundled application.

`npm test`: **15 integration tests passed**. These assert rendered pixel changes, not just the presence of buttons:

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

`node scripts/desktop-smoke.mjs` passes. It launches the actual Electron application, verifies a secure context with no renderer Node access, tests save/open/PNG through the native bridge using real temporary files, confirms canceled saves preserve the dirty state, and checks canceling the unsaved-close dialog. Dialog responses are substituted in the test process only; filesystem operations use the production implementation.

The interface was also opened with agent-browser and visually inspected. No runtime errors or Vite error overlay were detected. A screenshot is in `docs/studio.png`.

## What remains unverified

- Physical Wacom, Huion, XP-Pen, Surface and other pen hardware. The implementation consumes standard Windows Ink pressure, tilt and eraser events; driver settings and hardware capabilities vary.
- Long-duration/high-resolution painting performance, low-memory systems and Windows 11 hardware coverage.
- Color-critical/print workflows. The application currently uses sRGB 8-bit Canvas 2D and does not implement ICC/CMYK color management.

## Documentation sources

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security): secure protocol, sandbox, context isolation and a narrow validated IPC bridge.
- [PointerEvent](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent): pressure, tilt, hardware pointer type and coalesced input.
- [Vite guide](https://vite.dev/guide/): current stable build tool setup.
- [Node.js releases](https://nodejs.org/en/about/previous-releases): Node 24 LTS baseline.
- [electron-builder Windows targets](https://www.electron.build/win/): portable executable packaging.
