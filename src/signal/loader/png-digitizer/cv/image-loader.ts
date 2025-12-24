/**
 * Image Loader
 * Loads PNG/image files and converts to ImageData for processing
 *
 * @module signal/loader/png-digitizer/cv/image-loader
 */

/**
 * Supported image input types
 */
export type ImageSource = File | Blob | string | ImageData | HTMLCanvasElement | HTMLImageElement;

/**
 * Load an image from various sources and return ImageData
 *
 * @param source - Image source (File, Blob, URL, base64, ImageData, Canvas, or Image element)
 * @returns ImageData object ready for processing
 */
export async function loadImage(source: ImageSource): Promise<ImageData> {
  // Already ImageData
  if (isImageData(source)) {
    return source;
  }

  // HTMLCanvasElement
  if (source instanceof HTMLCanvasElement) {
    return getImageDataFromCanvas(source);
  }

  // HTMLImageElement
  if (source instanceof HTMLImageElement) {
    return getImageDataFromImage(source);
  }

  // File or Blob
  if (source instanceof Blob) {
    return loadImageFromBlob(source);
  }

  // String - could be URL, data URL, or base64
  if (typeof source === 'string') {
    return loadImageFromString(source);
  }

  throw new Error(`Unsupported image source type: ${typeof source}`);
}

/**
 * Type guard for ImageData
 */
function isImageData(obj: unknown): obj is ImageData {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'data' in obj &&
    'width' in obj &&
    'height' in obj &&
    (obj as ImageData).data instanceof Uint8ClampedArray
  );
}

/**
 * Get ImageData from canvas
 */
function getImageDataFromCanvas(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Get ImageData from image element
 */
function getImageDataFromImage(img: HTMLImageElement): ImageData {
  const canvas = createCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Load image from Blob/File
 */
async function loadImageFromBlob(blob: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(url);
    return getImageDataFromImage(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load image from string (URL, data URL, or base64)
 */
async function loadImageFromString(source: string): Promise<ImageData> {
  // Check if it's base64 without data URL prefix
  if (isBase64(source) && !source.startsWith('data:')) {
    source = `data:image/png;base64,${source}`;
  }

  const img = await loadImageElement(source);
  return getImageDataFromImage(img);
}

/**
 * Load an HTMLImageElement from URL
 */
function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image from: ${url.substring(0, 100)}...`));

    img.src = url;
  });
}

/**
 * Check if string looks like base64
 */
function isBase64(str: string): boolean {
  if (str.length < 50) return false;
  // Check for common base64 characters
  return /^[A-Za-z0-9+/=]+$/.test(str.substring(0, 100));
}

/**
 * Create a canvas element
 * Works in browser and Node.js (with canvas package)
 */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  // Node.js environment - try to use canvas package
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas: nodeCreateCanvas } = require('canvas');
    return nodeCreateCanvas(width, height);
  } catch {
    throw new Error('Canvas not available. Install "canvas" package for Node.js support.');
  }
}

/**
 * Convert ImageData to PNG Blob
 */
export async function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert ImageData to Blob'));
        }
      },
      'image/png'
    );
  });
}

/**
 * Convert ImageData to base64 string
 */
export function imageDataToBase64(imageData: ImageData): string {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}

/**
 * Get image dimensions from source without fully loading
 */
export async function getImageDimensions(source: ImageSource): Promise<{ width: number; height: number }> {
  if (isImageData(source)) {
    return { width: source.width, height: source.height };
  }

  if (source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }

  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }

  // For Blob/File/string, we need to load the image
  const imageData = await loadImage(source);
  return { width: imageData.width, height: imageData.height };
}
