/**
 * EXIF Orientation Handler
 * Handles image rotation based on EXIF orientation data
 *
 * Photos from phones/cameras often have EXIF orientation metadata
 * that browsers may or may not handle correctly. This module
 * ensures consistent orientation handling.
 *
 * EXIF Orientation values:
 * 1 = Normal (no rotation needed)
 * 2 = Flip horizontal
 * 3 = Rotate 180°
 * 4 = Flip vertical
 * 5 = Rotate 90° CCW + flip horizontal
 * 6 = Rotate 90° CW
 * 7 = Rotate 90° CW + flip horizontal
 * 8 = Rotate 90° CCW
 *
 * @module signal/loader/png-digitizer/cv/orientation-handler
 */

/**
 * EXIF orientation values
 */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Orientation correction result
 */
export interface OrientationResult {
  /** Corrected image data */
  imageData: ImageData;

  /** Original EXIF orientation */
  originalOrientation: ExifOrientation;

  /** Whether correction was applied */
  correctionApplied: boolean;

  /** Description of correction */
  correctionDescription: string;
}

/**
 * Orientation Handler class
 */
export class OrientationHandler {
  /**
   * Read EXIF orientation from JPEG/TIFF data
   */
  static readExifOrientation(data: ArrayBuffer | Uint8Array): ExifOrientation {
    const view = data instanceof Uint8Array ? new DataView(data.buffer, data.byteOffset, data.byteLength) : new DataView(data);

    // Check for JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) {
      return 1; // Not a JPEG, assume normal orientation
    }

    let offset = 2;
    const length = view.byteLength;

    while (offset < length) {
      // Find next marker
      if (view.getUint8(offset) !== 0xFF) {
        return 1;
      }

      const marker = view.getUint8(offset + 1);

      // APP1 marker (EXIF)
      if (marker === 0xE1) {
        // const exifLength = view.getUint16(offset + 2);

        // Check for "Exif\0\0" header
        if (
          view.getUint8(offset + 4) === 0x45 && // E
          view.getUint8(offset + 5) === 0x78 && // x
          view.getUint8(offset + 6) === 0x69 && // i
          view.getUint8(offset + 7) === 0x66 && // f
          view.getUint8(offset + 8) === 0x00 &&
          view.getUint8(offset + 9) === 0x00
        ) {
          return this.parseExifData(view, offset + 10);
        }
      }

      // Skip to next marker
      if (marker === 0xD8 || marker === 0xD9) {
        offset += 2;
      } else {
        const markerLength = view.getUint16(offset + 2);
        offset += 2 + markerLength;
      }
    }

    return 1;
  }

  /**
   * Parse EXIF data to find orientation
   */
  private static parseExifData(view: DataView, tiffOffset: number): ExifOrientation {
    // Check byte order
    const byteOrder = view.getUint16(tiffOffset);
    const littleEndian = byteOrder === 0x4949; // "II" = Intel = little endian

    // Verify TIFF magic number
    const magic = littleEndian
      ? view.getUint16(tiffOffset + 2, true)
      : view.getUint16(tiffOffset + 2, false);

    if (magic !== 0x002A) {
      return 1;
    }

    // Get IFD0 offset
    const ifd0Offset = littleEndian
      ? view.getUint32(tiffOffset + 4, true)
      : view.getUint32(tiffOffset + 4, false);

    // Parse IFD0
    const ifdStart = tiffOffset + ifd0Offset;
    const numEntries = littleEndian
      ? view.getUint16(ifdStart, true)
      : view.getUint16(ifdStart, false);

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdStart + 2 + i * 12;

      const tag = littleEndian
        ? view.getUint16(entryOffset, true)
        : view.getUint16(entryOffset, false);

      // Orientation tag = 0x0112
      if (tag === 0x0112) {
        const value = littleEndian
          ? view.getUint16(entryOffset + 8, true)
          : view.getUint16(entryOffset + 8, false);

        if (value >= 1 && value <= 8) {
          return value as ExifOrientation;
        }
      }
    }

    return 1;
  }

  /**
   * Correct image orientation based on EXIF data
   */
  static correctOrientation(
    imageData: ImageData,
    orientation: ExifOrientation
  ): OrientationResult {
    if (orientation === 1) {
      return {
        imageData,
        originalOrientation: orientation,
        correctionApplied: false,
        correctionDescription: 'No correction needed',
      };
    }

    const { width, height } = imageData;

    // Determine output dimensions
    const swap = orientation >= 5; // Orientations 5-8 swap width/height
    const outWidth = swap ? height : width;
    const outHeight = swap ? width : height;

    // Create output buffer
    const output = new ImageData(outWidth, outHeight);
    const srcData = imageData.data;
    const dstData = output.data;

    // Apply transformation
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;

        // Calculate destination coordinates based on orientation
        const [dstX, dstY] = this.transformCoordinates(x, y, width, height, orientation);
        const dstIdx = (dstY * outWidth + dstX) * 4;

        // Copy pixel
        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      }
    }

    return {
      imageData: output,
      originalOrientation: orientation,
      correctionApplied: true,
      correctionDescription: this.getOrientationDescription(orientation),
    };
  }

  /**
   * Transform source coordinates to destination coordinates
   */
  private static transformCoordinates(
    x: number,
    y: number,
    width: number,
    height: number,
    orientation: ExifOrientation
  ): [number, number] {
    switch (orientation) {
      case 1: // Normal
        return [x, y];
      case 2: // Flip horizontal
        return [width - 1 - x, y];
      case 3: // Rotate 180°
        return [width - 1 - x, height - 1 - y];
      case 4: // Flip vertical
        return [x, height - 1 - y];
      case 5: // Rotate 90° CCW + flip horizontal
        return [y, x];
      case 6: // Rotate 90° CW
        return [height - 1 - y, x];
      case 7: // Rotate 90° CW + flip horizontal
        return [height - 1 - y, width - 1 - x];
      case 8: // Rotate 90° CCW
        return [y, width - 1 - x];
      default:
        return [x, y];
    }
  }

  /**
   * Get human-readable description of orientation correction
   */
  private static getOrientationDescription(orientation: ExifOrientation): string {
    switch (orientation) {
      case 1: return 'Normal orientation';
      case 2: return 'Flipped horizontally';
      case 3: return 'Rotated 180°';
      case 4: return 'Flipped vertically';
      case 5: return 'Rotated 90° CCW and flipped horizontally';
      case 6: return 'Rotated 90° clockwise';
      case 7: return 'Rotated 90° CW and flipped horizontally';
      case 8: return 'Rotated 90° counter-clockwise';
      default: return 'Unknown orientation';
    }
  }

  /**
   * Auto-detect and correct orientation from raw image bytes
   */
  static async autoCorrect(
    imageBytes: ArrayBuffer | Uint8Array,
    imageData: ImageData
  ): Promise<OrientationResult> {
    const orientation = this.readExifOrientation(imageBytes);
    return this.correctOrientation(imageData, orientation);
  }
}

/**
 * Convenience function for orientation correction
 */
export function correctExifOrientation(
  imageData: ImageData,
  orientation: ExifOrientation
): OrientationResult {
  return OrientationHandler.correctOrientation(imageData, orientation);
}

/**
 * Read EXIF orientation from image bytes
 */
export function readExifOrientation(data: ArrayBuffer | Uint8Array): ExifOrientation {
  return OrientationHandler.readExifOrientation(data);
}
