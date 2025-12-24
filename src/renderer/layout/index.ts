/**
 * Layout exports
 * @module renderer/layout
 */

export {
  calculate3x4Layout,
  getSamplesForPanel,
  getLabelPosition,
  type LeadPanel,
  type TwelveLeadLayout,
  type LayoutOptions,
} from './twelve-lead';

// MUSE-format layout
export {
  calculateMuseLayout,
  calculateScreenLayout,
  calculateExportLayout,
  type MuseLeadPanel,
  type MuseSeparatorLine,
  type MuseLayout,
  type MuseLayoutOptions,
} from './muse-layout';
