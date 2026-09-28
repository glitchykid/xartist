# Project guidance

- Follow DRY, KISS, SOLID, YAGNI and BDUF. Sketch a small architecture before implementation, then develop complete tracer-bullet flows that can be exercised end to end.
- Keep README and application documentation in English and update them with behavior changes.
- Ask when a material product requirement is unclear; preserve the user's stated priority of illustration tools.
- Use the latest LTS technologies where available, otherwise the latest stable releases. Verify documentation against the selected version; avoid deprecated APIs.
- Keep the interface very compact, minimal and dark, with gunmetal as the main color and restrained warm accents. Minimize empty space. All interface controls must fit inside the supported window size without scrolling; use tabs, nested tabs or paging when needed. Avoid blue interface accents. Painting controls must still support the full color spectrum.
- Provide English, Russian, Ukrainian, Korean, Japanese and Simplified Chinese UI text for every user-facing feature.
- Use generated visual assets for the application's identity and modern minimal iconography; record asset provenance and prompts.
- Commit and push completed changes. Build Windows executables and publish GitHub releases for release milestones.
- On Windows, missing development/build tools may be installed through winget.
- Preserve users' artwork: validate imported projects before replacement, make edits undoable, protect unsaved work and retain clear file-save behavior.
- Treat synthetic pen tests as software validation, not certification of physical tablet compatibility.
