# UI Gauntlet action inventory

Every visible interactive element must declare `data-control`. Enabled controls must be exercised by `ui.spec.ts`; disabled controls must declare a non-empty `data-disabled-reason` and expose the same reason in `title`.

| Control | Browser assertion |
| --- | --- |
| Skip to content | Moves keyboard focus directly to the main content |
| Worklist, Viewer | Navigates between both UI states |
| Help, Close help, I understand | Opens the modal, moves focus, closes by both buttons and Escape |
| Refresh dataset | Refetches the local index and reports status |
| Dataset search, Category | Filters the local worklist including an empty result |
| Dataset Load | Loads a real repository ECG in the browser |
| Previous, Next | Navigates repository records |
| Open local JSON | Opens a real file chooser and rejects invalid data |
| Load synthetic sample | Loads an explicitly synthetic waveform |
| Save, Restore, Clear snapshot | Proves an exact patient identity, measurements/provenance, annotations, and waveform round trip in page memory, with no browser storage |
| Zoom −, Fit, Zoom + | Changes and resets the zoom readout |
| Grid | Toggles `aria-pressed` and redraws |
| Paper speed, Gain | Changes each display setting and redraws |
| Export PNG | Produces a browser download |
| Print | Invokes the browser print API |
| Clinical signing, Experimental ML, Image digitization | Remains disabled with a machine-asserted reason |

The inventory test compares every visible control to a closed allowlist. Adding an unclassified control fails the suite.
