/**
 * ECG Header Renderer
 *
 * Renders the header section with patient demographics and study info.
 *
 * @module renderer/components/header
 */

import { MUSE_SPEC } from '../../config/muse-spec';
import type { DeviceInfo } from '../../types/patient';
import type { Color } from '../../types/config';

/**
 * Header renderer configuration
 */
export interface HeaderRendererConfig {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Left margin in pixels */
  marginLeft?: number;
  /** Right margin in pixels */
  marginRight?: number;
  /** Text color override */
  textColor?: Color;
  /** Border color override */
  borderColor?: Color;
}

/**
 * Patient display data
 */
export interface PatientDisplayData {
  name: string;
  mrn: string;
  dob: string;
  age: string;
  sex: string;
  location?: string;
  referredBy?: string;
  confirmedBy?: string;
  orderNumber?: string;
  studyDate: string;
  studyTime: string;
}

/**
 * ECG Header Renderer
 */
export class HeaderRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: Required<HeaderRendererConfig>;

  constructor(ctx: CanvasRenderingContext2D, config: HeaderRendererConfig) {
    this.ctx = ctx;
    this.config = {
      width: config.width,
      height: config.height,
      marginLeft: config.marginLeft ?? 8,
      marginRight: config.marginRight ?? 8,
      textColor: config.textColor ?? MUSE_SPEC.typography.color,
      borderColor: config.borderColor ?? { rgb: { r: 192, g: 192, b: 192 }, hex: '#C0C0C0', rgba: 'rgba(192,192,192,1)' },
    };
  }

  /**
   * Render the complete header
   */
  render(patient: PatientDisplayData, deviceInfo?: DeviceInfo): void {
    const { width, height, marginLeft, marginRight, textColor, borderColor } = this.config;
    const ctx = this.ctx;

    // Bottom border line
    ctx.strokeStyle = borderColor.hex;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.stroke();

    // Left column - Patient info
    ctx.fillStyle = textColor.hex;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    ctx.font = 'bold 14px Arial, sans-serif';
    ctx.fillText(patient.name, marginLeft, 8);

    ctx.font = '11px Arial, sans-serif';
    ctx.fillText(`MRN: ${patient.mrn}`, marginLeft, 26);
    ctx.fillText(`DOB: ${patient.dob}  Age: ${patient.age}  Sex: ${patient.sex}`, marginLeft, 40);

    if (patient.location) {
      ctx.fillText(`Location: ${patient.location}`, marginLeft, 54);
    }

    // Right column - Study info
    ctx.textAlign = 'right';
    const rightX = width - marginRight;

    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText(`${patient.studyDate}  ${patient.studyTime}`, rightX, 8);

    ctx.font = '10px Arial, sans-serif';
    if (patient.referredBy) {
      ctx.fillText(`Referred by: ${patient.referredBy}`, rightX, 22);
    }
    ctx.fillText(patient.confirmedBy ? `Confirmed: ${patient.confirmedBy}` : 'UNCONFIRMED', rightX, 36);

    ctx.font = '9px Arial, sans-serif';
    ctx.fillStyle = '#666666';
    const deviceText = deviceInfo ? `${deviceInfo.manufacturer} ${deviceInfo.model}` : 'GEMUSE Pediatric ECG System';
    ctx.fillText(deviceText, rightX, 52);
  }
}

/**
 * Convenience function to render a header
 */
export function renderHeader(
  ctx: CanvasRenderingContext2D,
  patient: PatientDisplayData,
  width: number,
  height: number,
  deviceInfo?: DeviceInfo
): void {
  const renderer = new HeaderRenderer(ctx, { width, height });
  renderer.render(patient, deviceInfo);
}
