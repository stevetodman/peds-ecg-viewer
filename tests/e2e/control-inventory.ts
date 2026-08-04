/**
 * Deliberate allow-list for every interactive control rendered by demo.html.
 * Updating the UI without classifying a control must fail the E2E inventory test.
 */
export const CONTROL_INVENTORY = [
  'skip-content', 'show-worklist', 'show-viewer', 'show-help', 'refresh-dataset', 'dataset-search',
  'category-filter', 'worklist-scroll-region', 'dataset-load', 'previous-record', 'next-record', 'open-json',
  'load-sample', 'save-memory-snapshot', 'restore-memory-snapshot', 'clear-memory-snapshot',
  'zoom-out', 'fit-waveform', 'zoom-in', 'toggle-grid', 'export-png', 'print-view',
  'paper-speed', 'gain', 'waveform-scroll-region', 'clinical-signing', 'experimental-ml', 'image-digitization',
  'close-help', 'acknowledge-help',
] as const;

export const EXPECTED_CONTROLS = new Set<string>(CONTROL_INVENTORY);
