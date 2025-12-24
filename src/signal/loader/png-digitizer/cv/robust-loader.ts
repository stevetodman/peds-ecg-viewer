/**
 * Robust Image Loader
 * Handles edge cases: HEIC, corruption, timeouts, large files, animated GIFs
 *
 * @module signal/loader/png-digitizer/cv/robust-loader
 */

/**
 * Image loading options
 */
export interface RobustLoadOptions {
  /** Maximum file size in bytes (default: 100MB) */
  maxFileSize?: number;

  /** Maximum image dimensions (default: 10000x10000) */
  maxDimensions?: { width: number; height: number };

  /** Timeout for URL fetching in ms (default: 30000) */
  fetchTimeout?: number;

  /** Number of retry attempts for network errors (default: 3) */
  retryAttempts?: number;

  /** Convert to target format if needed */
  targetFormat?: 'png' | 'jpeg';

  /** Target max dimension for very large images */
  targetMaxDimension?: number;
}

/**
 * Image loading result
 */
export interface RobustLoadResult {
  /** Loaded image data */
  imageData: ImageData;

  /** Original format detected */
  originalFormat: string;

  /** Was conversion performed */
  converted: boolean;

  /** Was image resized */
  resized: boolean;

  /** Original dimensions */
  originalDimensions: { width: number; height: number };

  /** Warnings during loading */
  warnings: string[];

  /** Loading time in ms */
  loadTimeMs: number;
}

/**
 * Image format detection
 */
interface FormatInfo {
  format: 'png' | 'jpeg' | 'gif' | 'webp' | 'heic' | 'bmp' | 'tiff' | 'unknown';
  animated: boolean;
  frameCount: number;
}

/**
 * Robust Image Loader class
 */
export class RobustImageLoader {
  private options: Required<RobustLoadOptions>;

  constructor(options: RobustLoadOptions = {}) {
    this.options = {
      maxFileSize: options.maxFileSize ?? 100 * 1024 * 1024, // 100MB
      maxDimensions: options.maxDimensions ?? { width: 10000, height: 10000 },
      fetchTimeout: options.fetchTimeout ?? 30000,
      retryAttempts: options.retryAttempts ?? 3,
      targetFormat: options.targetFormat ?? 'png',
      targetMaxDimension: options.targetMaxDimension ?? 4000,
    };
  }

  /**
   * Load image from any source with robust error handling
   */
  async load(
    source: File | Blob | string | ArrayBuffer | ImageData
  ): Promise<RobustLoadResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Already ImageData
      if (this.isImageData(source)) {
        return {
          imageData: source as ImageData,
          originalFormat: 'raw',
          converted: false,
          resized: false,
          originalDimensions: { width: (source as ImageData).width, height: (source as ImageData).height },
          warnings: [],
          loadTimeMs: Date.now() - startTime,
        };
      }

      // Get blob from source
      let blob: Blob;
      let originalFormat: string = 'unknown';

      if (source instanceof Blob) {
        blob = source;
        originalFormat = source.type || 'unknown';
      } else if (source instanceof ArrayBuffer) {
        const format = this.detectFormat(new Uint8Array(source));
        originalFormat = format.format;
        blob = new Blob([source], { type: this.getMimeType(format.format) });
      } else if (typeof source === 'string') {
        const result = await this.loadFromString(source);
        blob = result.blob;
        originalFormat = result.format;
        warnings.push(...result.warnings);
      } else {
        throw new Error('Unsupported image source type');
      }

      // Check file size
      if (blob.size > this.options.maxFileSize) {
        throw new Error(`Image too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB exceeds ${(this.options.maxFileSize / 1024 / 1024).toFixed(0)}MB limit`);
      }

      // Detect format from bytes
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const formatInfo = this.detectFormat(bytes);
      originalFormat = formatInfo.format;

      // Handle animated GIFs
      if (formatInfo.animated) {
        warnings.push(`Animated ${formatInfo.format.toUpperCase()} detected (${formatInfo.frameCount} frames), using first frame`);
      }

      // Handle HEIC
      if (formatInfo.format === 'heic') {
        const converted = await this.convertHEIC(bytes);
        if (converted) {
          blob = converted;
          warnings.push('HEIC format converted to JPEG');
        } else {
          throw new Error('HEIC format detected but conversion not available. Install heic-convert package.');
        }
      }

      // Load to ImageData
      let imageData = await this.blobToImageData(blob);
      const originalDimensions = { width: imageData.width, height: imageData.height };

      // Check dimensions
      if (imageData.width > this.options.maxDimensions.width ||
          imageData.height > this.options.maxDimensions.height) {
        throw new Error(`Image dimensions ${imageData.width}x${imageData.height} exceed maximum ${this.options.maxDimensions.width}x${this.options.maxDimensions.height}`);
      }

      // Resize if very large
      let resized = false;
      if (imageData.width > this.options.targetMaxDimension ||
          imageData.height > this.options.targetMaxDimension) {
        const scale = this.options.targetMaxDimension / Math.max(imageData.width, imageData.height);
        imageData = await this.resizeImageData(imageData, scale);
        resized = true;
        warnings.push(`Image resized from ${originalDimensions.width}x${originalDimensions.height} to ${imageData.width}x${imageData.height}`);
      }

      return {
        imageData,
        originalFormat,
        converted: formatInfo.format === 'heic',
        resized,
        originalDimensions,
        warnings,
        loadTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`Failed to load image: ${error}`);
    }
  }

  /**
   * Check if value is ImageData
   */
  private isImageData(value: any): boolean {
    return value &&
      typeof value.width === 'number' &&
      typeof value.height === 'number' &&
      value.data instanceof Uint8ClampedArray;
  }

  /**
   * Load from string (URL, data URL, base64, file path)
   */
  private async loadFromString(source: string): Promise<{
    blob: Blob;
    format: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Data URL
    if (source.startsWith('data:')) {
      const [header, base64] = source.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bytes = this.base64ToBytes(base64);
      return {
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: mimeType }),
        format: mimeType.split('/')[1] || 'unknown',
        warnings,
      };
    }

    // URL
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const blob = await this.fetchWithRetry(source);
      return {
        blob,
        format: blob.type.split('/')[1] || 'unknown',
        warnings,
      };
    }

    // File path (Node.js)
    if (typeof process !== 'undefined' && !source.startsWith('data:')) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs');
        if (fs.existsSync(source)) {
          const buffer = fs.readFileSync(source);
          const format = this.detectFormat(buffer);
          return {
            blob: new Blob([buffer], { type: this.getMimeType(format.format) }),
            format: format.format,
            warnings,
          };
        }
      } catch {
        // Fall through to base64
      }
    }

    // Assume base64
    try {
      const bytes = this.base64ToBytes(source);
      const format = this.detectFormat(bytes);
      return {
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: this.getMimeType(format.format) }),
        format: format.format,
        warnings,
      };
    } catch {
      throw new Error('Invalid image source string');
    }
  }

  /**
   * Fetch URL with retry and timeout
   */
  private async fetchWithRetry(url: string): Promise<Blob> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.options.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.fetchTimeout);

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.blob();
      } catch (error: any) {
        lastError = error;

        // Don't retry on 4xx errors
        if (error.message?.includes('HTTP 4')) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.options.retryAttempts - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Failed to fetch image');
  }

  /**
   * Detect image format from bytes
   */
  private detectFormat(bytes: Uint8Array): FormatInfo {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return { format: 'png', animated: this.isPngAnimated(bytes), frameCount: 1 };
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return { format: 'jpeg', animated: false, frameCount: 1 };
    }

    // GIF: 47 49 46 38
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      const frameCount = this.countGifFrames(bytes);
      return { format: 'gif', animated: frameCount > 1, frameCount };
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return { format: 'webp', animated: this.isWebpAnimated(bytes), frameCount: 1 };
    }

    // HEIC/HEIF: ... 66 74 79 70 (ftyp) followed by heic, heix, hevc, etc.
    if (this.isHEIC(bytes)) {
      return { format: 'heic', animated: false, frameCount: 1 };
    }

    // BMP: 42 4D
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
      return { format: 'bmp', animated: false, frameCount: 1 };
    }

    // TIFF: 49 49 2A 00 or 4D 4D 00 2A
    if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
        (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) {
      return { format: 'tiff', animated: false, frameCount: 1 };
    }

    return { format: 'unknown', animated: false, frameCount: 1 };
  }

  /**
   * Check if PNG is animated (APNG)
   */
  private isPngAnimated(bytes: Uint8Array): boolean {
    // Look for acTL chunk which indicates APNG
    const str = String.fromCharCode.apply(null, Array.from(bytes.slice(0, 1000)));
    return str.includes('acTL');
  }

  /**
   * Count GIF frames
   */
  private countGifFrames(bytes: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < bytes.length - 2; i++) {
      // Image separator: 0x2C
      if (bytes[i] === 0x2C) count++;
    }
    return Math.max(1, count);
  }

  /**
   * Check if WebP is animated
   */
  private isWebpAnimated(bytes: Uint8Array): boolean {
    // Look for ANIM chunk
    const str = String.fromCharCode.apply(null, Array.from(bytes.slice(0, 100)));
    return str.includes('ANIM');
  }

  /**
   * Check if bytes are HEIC format
   */
  private isHEIC(bytes: Uint8Array): boolean {
    // Look for ftyp box
    if (bytes.length < 12) return false;

    // ftyp at offset 4
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
    }

    return false;
  }

  /**
   * Get MIME type from format
   */
  private getMimeType(format: string): string {
    const mimes: Record<string, string> = {
      png: 'image/png',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      heic: 'image/heic',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
    };
    return mimes[format] || 'application/octet-stream';
  }

  /**
   * Convert HEIC to JPEG
   */
  private async convertHEIC(bytes: Uint8Array): Promise<Blob | null> {
    // Try heic-convert in Node.js
    if (typeof process !== 'undefined') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const heicConvert = require('heic-convert');
        const jpegBuffer = await heicConvert({
          buffer: Buffer.from(bytes),
          format: 'JPEG',
          quality: 0.92,
        });
        return new Blob([jpegBuffer], { type: 'image/jpeg' });
      } catch {
        // heic-convert not available
      }
    }

    // Browser: try heic2any if available
    if (typeof window !== 'undefined' && (window as any).heic2any) {
      try {
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/heic' });
        const result = await (window as any).heic2any({ blob, toType: 'image/jpeg' });
        return result as Blob;
      } catch {
        // heic2any not available or failed
      }
    }

    return null;
  }

  /**
   * Convert Blob to ImageData
   */
  private async blobToImageData(blob: Blob): Promise<ImageData> {
    if (typeof document !== 'undefined') {
      // Browser
      const url = URL.createObjectURL(blob);
      try {
        const img = await this.loadImageElement(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      } finally {
        URL.revokeObjectURL(url);
      }
    } else {
      // Node.js
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createCanvas, loadImage } = require('canvas');
      const buffer = Buffer.from(await blob.arrayBuffer());
      const img = await loadImage(buffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }

  /**
   * Load image element with error handling
   */
  private loadImageElement(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = url;
    });
  }

  /**
   * Resize ImageData
   */
  private async resizeImageData(imageData: ImageData, scale: number): Promise<ImageData> {
    const newWidth = Math.round(imageData.width * scale);
    const newHeight = Math.round(imageData.height * scale);

    if (typeof document !== 'undefined') {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = imageData.width;
      srcCanvas.height = imageData.height;
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.putImageData(imageData, 0, 0);

      const dstCanvas = document.createElement('canvas');
      dstCanvas.width = newWidth;
      dstCanvas.height = newHeight;
      const dstCtx = dstCanvas.getContext('2d')!;
      dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);

      return dstCtx.getImageData(0, 0, newWidth, newHeight);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createCanvas, createImageData } = require('canvas');

      const srcCanvas = createCanvas(imageData.width, imageData.height);
      const srcCtx = srcCanvas.getContext('2d');
      const nodeImageData = createImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
      srcCtx.putImageData(nodeImageData, 0, 0);

      const dstCanvas = createCanvas(newWidth, newHeight);
      const dstCtx = dstCanvas.getContext('2d');
      dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);

      return dstCtx.getImageData(0, 0, newWidth, newHeight);
    }
  }

  /**
   * Convert base64 to Uint8Array
   */
  private base64ToBytes(base64: string): Uint8Array {
    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

/**
 * Convenience function for robust image loading
 */
export async function loadImageRobust(
  source: File | Blob | string | ArrayBuffer | ImageData,
  options?: RobustLoadOptions
): Promise<RobustLoadResult> {
  const loader = new RobustImageLoader(options);
  return loader.load(source);
}
