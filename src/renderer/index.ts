/**
 * Renderer exports
 * @module renderer
 */

// Main renderer
export {
  ECGRenderer,
  createECGRenderer,
  createScreenRenderer,
  createExportRenderer,
  type ECGRendererOptions,
} from './ecg-renderer';

// Components
export {
  GridRenderer,
  renderGrid,
  WaveformRenderer,
  renderLead,
  LabelRenderer,
  LEAD_LAYOUT_3X4,
  LEAD_LAYOUT_6X2,
  HeaderRenderer,
  renderHeader,
  MeasurementsBoxRenderer,
  renderMeasurementsBox,
  toMeasurementsDisplay,
  FooterRenderer,
  renderFooter,
  CalibrationMarkerRenderer,
  renderCalibrationMarker,
  type GridRendererConfig,
  type GridMetrics,
  type WaveformRendererConfig,
  type LabelRendererConfig,
  type HeaderRendererConfig,
  type PatientDisplayData,
  type MeasurementsBoxConfig,
  type MeasurementsDisplayData,
  type FooterRendererConfig,
  type FooterDisplayData,
  type CalibrationMarkerConfig,
} from './components';

// Layout
export {
  calculate3x4Layout,
  getSamplesForPanel,
  getLabelPosition,
  calculateMuseLayout,
  calculateScreenLayout,
  calculateExportLayout,
  type LeadPanel,
  type TwelveLeadLayout,
  type LayoutOptions,
  type MuseLeadPanel,
  type MuseSeparatorLine,
  type MuseLayout,
  type MuseLayoutOptions,
} from './layout';

// Document renderers
export {
  FullPageRenderer,
  renderFullPage,
  type FullPageRenderOptions,
  type FullPageDocumentData,
} from './document';
