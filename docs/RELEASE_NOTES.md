# X Artist 0.1.0

The first public preview of a free, offline illustration studio for Windows x64.

This release includes eight pressure/tilt-aware brushes, independent stabilization and smoothing, layers, reversible pixel edits, rectangular selections, move/scale/rotate/flip, color adjustments, multilayer project files, PNG export, local session recovery and six interface languages.

Download the portable `.exe`, launch it and start drawing. Enable Windows Ink in your tablet driver for pressure and tilt. No account or subscription is required.

## Validation

15 browser integration tests cover drawing, erasing, pressure, tilt, opacity, all brush presets, layer state, selections, transforms, adjustments, project round-trips, malformed files, PNG transparency, six languages, recovery and moving selected pixels. The desktop smoke check verifies the isolated secure renderer, actual file I/O through the native bridge, canceled saving and unsaved-close protection.

## Preview limitations

This is an early illustration editor, not full Photoshop/Krita parity. No PSD, CMYK/ICC workflows, animation timeline, editable text or freeform selections are included. Documents are 8-bit sRGB, limited to 4096 px per side and 16 million pixels; aggregate layers are memory-limited. Tablet event handling is tested synthetically; physical tablet compatibility still needs device testing. The Windows executable is unsigned.

Source and documentation are available under the MIT license.
