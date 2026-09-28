# Architecture

X Artist is an offline-first Windows illustration editor. This first tracer-bullet release implements the complete draw → layer → edit → save → reopen → export path before adding animation or comic layout systems.

- **Renderer:** strict TypeScript, semantic HTML and CSS. No UI framework or network service.
- **Drawing:** Canvas 2D raster layers, isolated brush stroke surface, Pointer Events with pressure, tilt and coalesced samples. Stabilization filters position; smoothing controls interpolation separately.
- **Document:** ordered raster layers, visibility, opacity, blend modes, rectangular selection, bounded undo/redo history. The document remains independent of view zoom and pan.
- **Persistence:** versioned `.xartist` JSON containing PNG layer payloads. Input validation precedes decoding and document replacement. IndexedDB stores a single recovery copy.
- **Desktop:** Electron with a sandboxed renderer, context isolation and a narrow preload bridge. A custom secure protocol serves only bundled renderer assets; native file dialogs mediate access to files.
- **Distribution:** portable Windows x64 executable; GitHub release workflow. Dependencies are pinned in the lockfile.

## Deliberate boundaries

This is an early illustration editor, not feature parity with Photoshop or Krita. There is no PSD compatibility, CMYK, ICC color management, text engine, vector layers, advanced selection masks, timeline, plug-in engine or GPU brush engine. Raster data is sRGB/8-bit. Maximum canvas side is 4096, maximum area is 16 megapixels and aggregate layer area is 64 megapixels. History is bounded by memory. These limits keep behavior explicit rather than promising unrestricted professional workloads.

Tablet pressure and tilt depend on the device and driver exposing Windows Ink Pointer Events. Mouse input uses constant pressure. Actual tablet hardware must be validated independently of synthetic event tests.
