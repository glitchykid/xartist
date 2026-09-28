# X Artist 0.1.2

An early preview of a free, offline illustration studio for Windows x64, with a dense, scroll-free interface.

This release includes eight pressure/tilt-aware brushes, independent stabilization and smoothing, layers, reversible pixel edits, rectangular selections, move/scale/rotate/flip, color adjustments, multilayer project files, PNG export, local session recovery and six interface languages.

The 0.1.2 update adds transparent raster toolbar icons and explicit high-quality image smoothing. It fixes brush-size shortcuts at 1–2 px and rejects truncated PNG layers before they can replace existing artwork. Additional cancellation, boundary and undo-history regressions were developed with failing tests first.

Download the portable `.exe`, launch it and start drawing. Enable Windows Ink in your tablet driver for pressure and tilt. No account or subscription is required.

## Validation

24 browser integration tests cover drawing, erasing, pressure, tilt, opacity, all brush presets, layer state, selections, transforms, adjustments, project round-trips, malformed files, PNG transparency, six languages, recovery and moving selected pixels. New checks verify that every control fits a minimum 1040 × 720 Windows window without scrolling, including all six languages, and that all 24 layers remain accessible through paging. The desktop smoke check verifies the isolated secure renderer, actual file I/O through the native bridge, canceled saving and unsaved-close protection.

## Preview limitations

This is an early illustration editor, not full Photoshop/Krita parity. No PSD, CMYK/ICC workflows, animation timeline, editable text or freeform selections are included. Documents are 8-bit sRGB, limited to 4096 px per side and 16 million pixels; aggregate layers are memory-limited. Tablet event handling is tested synthetically; physical tablet compatibility still needs device testing. The Windows executable is unsigned.

Source and documentation are available under the MIT license.
