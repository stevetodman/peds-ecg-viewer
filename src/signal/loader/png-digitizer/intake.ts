/**
 * Local ECG screenshot intake and quality gate.
 *
 * This module only accepts bytes already available to the caller. It does not
 * fetch, upload, or interpret an ECG. An accepted intake means the local
 * digitization prerequisites were evidenced; it does not imply clinical or
 * diagnostic accuracy.
 */

export type IntakeFormat = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf';
export type IntakeQualityState = 'accepted' | 'manual-review' | 'rejected';
export type IntakeReason =
  | 'empty_content'
  | 'file_too_large'
  | 'unsupported_content'
  | 'malformed_content'
  | 'declared_type_mismatch'
  | 'image_dimensions_missing'
  | 'image_resolution_insufficient'
  | 'grid_evidence_missing'
  | 'calibration_evidence_missing'
  | 'trace_evidence_missing';

/** A local byte source. URLs and paths are intentionally not accepted. */
export interface LocalECGDocument {
  name: string;
  type?: string;
  content: ArrayBuffer | Uint8Array | Blob;
  lastModified?: number;
}

export type LocalECGIntakeSource = LocalECGDocument | File;

/** Evidence produced by local, deterministic image-processing steps. */
export interface LocalDigitizationEvidence {
  /** Dimensions of the locally rendered/analyzed image or PDF page. */
  image?: Readonly<{ width: number; height: number }>;
  /** Number of locally rendered PDF pages considered, when the source is a PDF. */
  renderedPageCount?: number;
  grid?: Readonly<{ detected: boolean; confidence: number }>;
  calibration?: Readonly<{ detected: boolean; confidence: number }>;
  trace?: Readonly<{ detected: boolean; confidence: number; pointCount: number }>;
}

export interface IntakeProvenance {
  readonly name: string;
  readonly declaredType: string | undefined;
  readonly detectedType: string | undefined;
  readonly sizeBytes: number;
  readonly sha256: string | undefined;
  readonly lastModified: number | undefined;
}

export interface ECGScreenshotIntake {
  readonly provenance: IntakeProvenance;
  readonly format: IntakeFormat | undefined;
  readonly state: IntakeQualityState;
  readonly reasons: readonly IntakeReason[];
  /** True only when all required local evidence is present and strong enough. */
  readonly validatedForDigitization: boolean;
}

/** An intake narrowed to the only state that may be labelled validated. */
export interface ValidatedECGScreenshotIntake extends ECGScreenshotIntake {
  readonly state: 'accepted';
  readonly validatedForDigitization: true;
}

const MAX_CONTENT_BYTES = 50 * 1024 * 1024;
const MIN_IMAGE_WIDTH = 800;
const MIN_IMAGE_HEIGHT = 400;
const MIN_EVIDENCE_CONFIDENCE = 0.8;
const MIN_TRACE_POINTS = 100;

/**
 * Intake a local image or PDF and apply a deterministic quality gate.
 * The returned object is frozen so provenance and gate outcome cannot change.
 */
export async function intakeECGScreenshot(
  source: LocalECGIntakeSource,
  evidence: LocalDigitizationEvidence = {},
): Promise<ECGScreenshotIntake> {
  const input = await readLocalInput(source);
  const format = detectFormat(input.bytes);
  const reasons: IntakeReason[] = [];

  if (input.bytes.byteLength === 0) reasons.push('empty_content');
  if (input.bytes.byteLength > MAX_CONTENT_BYTES) reasons.push('file_too_large');
  if (!format) reasons.push('unsupported_content');
  if (format && !declaredTypeMatches(format, input.type)) reasons.push('declared_type_mismatch');

  const dimensions = format && format !== 'pdf' ? readImageDimensions(format, input.bytes) : undefined;
  if (format && format !== 'pdf' && !dimensions) reasons.push('malformed_content');

  if (format && !reasons.some(isRejectedReason)) {
    addEvidenceReasons(reasons, format, dimensions, evidence);
  }

  const rejected = reasons.some(isRejectedReason);
  const state: IntakeQualityState = rejected
    ? 'rejected'
    : reasons.length === 0
      ? 'accepted'
      : 'manual-review';
  const provenance = freezeProvenance({
    name: input.name,
    declaredType: input.type || undefined,
    detectedType: format ? mimeFor(format) : undefined,
    sizeBytes: input.bytes.byteLength,
    sha256: await sha256(input.bytes),
    lastModified: input.lastModified,
  });

  return Object.freeze({
    provenance,
    format,
    state,
    reasons: Object.freeze([...reasons]),
    validatedForDigitization: state === 'accepted',
  });
}

/**
 * Returns a validated intake only for an accepted local gate result.
 * Consumers should use this before labelling a digitization as validated.
 */
export function requireValidatedIntake(
  intake: ECGScreenshotIntake,
): ValidatedECGScreenshotIntake {
  if (intake.state !== 'accepted' || !intake.validatedForDigitization) {
    throw new Error(`Digitization intake is not validated: ${intake.reasons.join(', ') || intake.state}`);
  }
  return intake as ValidatedECGScreenshotIntake;
}

interface ReadLocalInput {
  name: string;
  type: string;
  bytes: Uint8Array;
  lastModified: number | undefined;
}

async function readLocalInput(source: LocalECGIntakeSource): Promise<ReadLocalInput> {
  if (isFileLike(source)) {
    return {
      name: source.name,
      type: source.type,
      bytes: new Uint8Array(await source.arrayBuffer()),
      lastModified: source.lastModified,
    };
  }

  return {
    name: source.name,
    type: source.type ?? '',
    bytes: await toBytes(source.content),
    lastModified: source.lastModified,
  };
}

function isFileLike(source: LocalECGIntakeSource): source is File {
  return 'arrayBuffer' in source && 'name' in source && 'lastModified' in source;
}

async function toBytes(content: LocalECGDocument['content']): Promise<Uint8Array> {
  if (content instanceof Uint8Array) return new Uint8Array(content);
  if (content instanceof ArrayBuffer) return new Uint8Array(content.slice(0));
  return new Uint8Array(await content.arrayBuffer());
}

function detectFormat(bytes: Uint8Array): IntakeFormat | undefined {
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (hasText(bytes, 'GIF87a') || hasText(bytes, 'GIF89a')) return 'gif';
  if (hasText(bytes, 'RIFF') && hasText(bytes, 'WEBP', 8)) return 'webp';
  if (hasText(bytes, '%PDF-')) return 'pdf';
  return undefined;
}

function hasBytes(bytes: Uint8Array, expected: number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasText(bytes: Uint8Array, expected: string, offset = 0): boolean {
  return hasBytes(bytes, [...expected].map(char => char.charCodeAt(0)), offset);
}

function declaredTypeMatches(format: IntakeFormat, declaredType: string): boolean {
  if (!declaredType || declaredType === 'application/octet-stream') return true;
  const normalized = declaredType.toLowerCase().split(';', 1)[0].trim();
  return normalized === mimeFor(format) || (format === 'jpeg' && normalized === 'image/jpg');
}

function mimeFor(format: IntakeFormat): string {
  return format === 'jpeg' ? 'image/jpeg' : format === 'pdf' ? 'application/pdf' : `image/${format}`;
}

function addEvidenceReasons(
  reasons: IntakeReason[],
  format: IntakeFormat,
  dimensions: { width: number; height: number } | undefined,
  evidence: LocalDigitizationEvidence,
): void {
  const image = format === 'pdf' ? evidence.image : dimensions;
  if (!image || !isPositiveInteger(image.width) || !isPositiveInteger(image.height)) {
    reasons.push('image_dimensions_missing');
  } else if (image.width < MIN_IMAGE_WIDTH || image.height < MIN_IMAGE_HEIGHT) {
    reasons.push('image_resolution_insufficient');
  }

  // A PDF is only eligible after at least one page was rendered and analyzed locally.
  if (format === 'pdf' && (!Number.isInteger(evidence.renderedPageCount) || evidence.renderedPageCount! < 1)) {
    reasons.push('image_dimensions_missing');
  }
  if (!hasDetectedEvidence(evidence.grid)) reasons.push('grid_evidence_missing');
  if (!hasDetectedEvidence(evidence.calibration)) reasons.push('calibration_evidence_missing');
  if (!evidence.trace || !evidence.trace.detected || evidence.trace.confidence < MIN_EVIDENCE_CONFIDENCE || evidence.trace.pointCount < MIN_TRACE_POINTS) {
    reasons.push('trace_evidence_missing');
  }
}

function hasDetectedEvidence(evidence: { detected: boolean; confidence: number } | undefined): boolean {
  return Boolean(evidence?.detected && evidence.confidence >= MIN_EVIDENCE_CONFIDENCE);
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isRejectedReason(reason: IntakeReason): boolean {
  return reason === 'empty_content'
    || reason === 'file_too_large'
    || reason === 'unsupported_content'
    || reason === 'malformed_content';
}

function freezeProvenance(provenance: IntakeProvenance): IntakeProvenance {
  return Object.freeze({ ...provenance });
}

async function sha256(bytes: Uint8Array): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  // Copy into an ArrayBuffer-backed view: Web Crypto does not accept a
  // SharedArrayBuffer-backed view in newer TypeScript DOM declarations.
  const localCopy = new Uint8Array(bytes.byteLength);
  localCopy.set(bytes);
  const digest = await subtle.digest('SHA-256', localCopy);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function readImageDimensions(
  format: Exclude<IntakeFormat, 'pdf'>,
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  if (format === 'png') return readPngDimensions(bytes);
  if (format === 'gif') return readGifDimensions(bytes);
  if (format === 'jpeg') return readJpegDimensions(bytes);
  return readWebpDimensions(bytes);
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (!hasText(bytes, 'IHDR', 12) || bytes.length < 24) return undefined;
  return dimensionsFrom(readUint32(bytes, 16), readUint32(bytes, 20));
}

function readGifDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 10) return undefined;
  return dimensionsFrom(readUint16LE(bytes, 6), readUint16LE(bytes, 8));
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  for (let index = 2; index + 8 < bytes.length;) {
    if (bytes[index] !== 0xff) {
      index++;
      continue;
    }
    const marker = bytes[index + 1];
    index += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = readUint16BE(bytes, index);
    if (length < 2 || index + length > bytes.length) return undefined;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return dimensionsFrom(readUint16BE(bytes, index + 3), readUint16BE(bytes, index + 5));
    }
    index += length;
  }
  return undefined;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 30) return undefined;
  if (hasText(bytes, 'VP8X', 12)) {
    return dimensionsFrom(readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1);
  }
  if (hasText(bytes, 'VP8 ', 12) && hasBytes(bytes, [0x9d, 0x01, 0x2a], 23)) {
    return dimensionsFrom(readUint16LE(bytes, 26) & 0x3fff, readUint16LE(bytes, 28) & 0x3fff);
  }
  return undefined;
}

function dimensionsFrom(width: number, height: number): { width: number; height: number } | undefined {
  return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : undefined;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) * 0x1000000)
    + ((bytes[offset + 1] ?? 0) << 16)
    + ((bytes[offset + 2] ?? 0) << 8)
    + (bytes[offset + 3] ?? 0);
}
