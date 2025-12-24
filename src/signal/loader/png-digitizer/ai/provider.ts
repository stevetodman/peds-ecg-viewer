/**
 * AI Provider Interface and Base Class
 * Abstract base for Vision AI providers
 *
 * @module signal/loader/png-digitizer/ai/provider
 */

import type { AIAnalysisResult, ECGImageAnalysis } from '../types';
import { parseAIResponse } from './response-parser';
import { validateAnalysis } from './validator';
import { getAnalysisPrompt } from './prompts';

/**
 * AI Provider interface
 */
export interface AIProvider {
  /** Provider name */
  name: string;

  /** Analyze an ECG image */
  analyze(imageData: ImageData | Blob | string): Promise<AIAnalysisResult>;
}

/**
 * Abstract base class for AI providers
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract name: string;
  protected apiKey: string;
  protected model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    // Model is set in subclass constructor or use provided model
    this.model = model ?? '';
  }

  /** Initialize model with default if not set */
  protected initModel(defaultModel: string): void {
    if (!this.model) {
      this.model = defaultModel;
    }
  }

  /** Call the AI API with image and prompt */
  protected abstract callAPI(imageBase64: string, prompt: string): Promise<string>;

  /**
   * Analyze an ECG image
   */
  async analyze(image: ImageData | Blob | string): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    // Convert image to base64
    const base64 = await this.imageToBase64(image);

    // Get analysis prompt
    const prompt = getAnalysisPrompt();

    // Call API
    let rawResponse: string;
    try {
      rawResponse = await this.callAPI(base64, prompt);
    } catch (error) {
      throw new Error(`${this.name} API call failed: ${String(error)}`);
    }

    // Parse response
    let analysis: ECGImageAnalysis;
    try {
      analysis = parseAIResponse(rawResponse);
    } catch (error) {
      throw new Error(`Failed to parse ${this.name} response: ${String(error)}`);
    }

    // Validate and calculate confidence
    const confidence = validateAnalysis(analysis);

    return {
      confidence,
      rawResponse,
      analysis,
      provider: this.name,
      model: this.model,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Convert various image formats to base64
   */
  protected async imageToBase64(image: ImageData | Blob | string): Promise<string> {
    // String input
    if (typeof image === 'string') {
      // Already base64 or data URL
      if (image.startsWith('data:')) {
        return image.split(',')[1];
      }
      // Looks like base64 already
      if (this.isBase64(image)) {
        return image;
      }
      // URL - fetch and convert
      const response = await fetch(image);
      const blob = await response.blob();
      return this.blobToBase64(blob);
    }

    // Blob input
    if (image instanceof Blob) {
      return this.blobToBase64(image);
    }

    // ImageData - convert to PNG blob
    return this.imageDataToBase64(image);
  }

  /**
   * Convert Blob to base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert ImageData to base64, with automatic resizing for large images
   * Anthropic API limit is 5MB on the base64-encoded string
   */
  private async imageDataToBase64(imageData: ImageData): Promise<string> {
    console.log('[AI Provider] imageDataToBase64 called - compression code is running');

    // Anthropic's 5MB limit is on the base64-encoded string, not decoded bytes
    // Base64 adds ~33% overhead, so 5MB base64 ≈ 3.75MB raw
    const API_LIMIT_CHARS = 5 * 1024 * 1024; // 5 MB limit on base64 string length
    const TARGET_SIZE_CHARS = 4.5 * 1024 * 1024; // Target 4.5MB to have buffer

    let width = imageData.width;
    let height = imageData.height;

    console.log(`[AI Provider] Processing image: ${width}x${height}`);

    // First, try without any compression
    let base64 = await this.imageDataToBase64Raw(imageData);

    console.log(`[AI Provider] Original image: ${width}x${height}, base64 length: ${base64.length} (${(base64.length / 1024 / 1024).toFixed(2)}MB)`);

    // If under limit, we're done - no compression needed
    if (base64.length <= API_LIMIT_CHARS) {
      console.log(`[AI Provider] Image is under 5MB limit, no compression needed`);
      return base64;
    }

    // Need to compress
    console.log(`[AI Provider] Image exceeds 5MB API limit (${(base64.length / 1024 / 1024).toFixed(2)}MB), compressing...`);

    // Try JPEG first (usually much smaller than PNG)
    base64 = await this.imageDataToBase64Raw(imageData, 'image/jpeg', 0.92);
    console.log(`[AI Provider] JPEG quality 0.92: ${(base64.length / 1024 / 1024).toFixed(2)}MB`);

    if (base64.length <= API_LIMIT_CHARS) {
      return base64;
    }

    // Still too big - need to resize
    let currentImageData = imageData;
    let scale = 0.9;

    while (base64.length > TARGET_SIZE_CHARS && scale > 0.3) {
      width = Math.round(imageData.width * scale);
      height = Math.round(imageData.height * scale);
      currentImageData = await this.resizeImageData(imageData, width, height);

      // Use JPEG with good quality
      base64 = await this.imageDataToBase64Raw(currentImageData, 'image/jpeg', 0.85);

      console.log(`[AI Provider] Resized to ${width}x${height} (${(scale * 100).toFixed(0)}%), ${(base64.length / 1024 / 1024).toFixed(2)}MB`);

      scale -= 0.1;
    }

    if (base64.length > API_LIMIT_CHARS) {
      throw new Error(`Image too large (${(base64.length / 1024 / 1024).toFixed(1)}MB) - could not compress below 5MB API limit`);
    }

    return base64;
  }

  /**
   * Resize ImageData to new dimensions
   */
  private resizeImageData(imageData: ImageData, newWidth: number, newHeight: number): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      try {
        // Create source canvas with original image
        const srcCanvas = this.createCanvas(imageData.width, imageData.height);
        const srcCtx = srcCanvas.getContext('2d')!;

        if (typeof document === 'undefined') {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createImageData } = require('canvas');
          const nodeImageData = createImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
          );
          srcCtx.putImageData(nodeImageData, 0, 0);
        } else {
          srcCtx.putImageData(imageData, 0, 0);
        }

        // Create destination canvas and draw scaled
        const dstCanvas = this.createCanvas(newWidth, newHeight);
        const dstCtx = dstCanvas.getContext('2d')!;
        dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);

        // Get the resized image data
        const resizedData = dstCtx.getImageData(0, 0, newWidth, newHeight);
        resolve(resizedData);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Convert ImageData to base64 (raw, no resizing)
   */
  private imageDataToBase64Raw(
    imageData: ImageData,
    mimeType: string = 'image/png',
    quality?: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const canvas = this.createCanvas(imageData.width, imageData.height);
        const ctx = canvas.getContext('2d')!;

        // In Node.js with node-canvas, we need to create a proper ImageData
        if (typeof document === 'undefined') {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createImageData } = require('canvas');
          const nodeImageData = createImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
          );
          ctx.putImageData(nodeImageData, 0, 0);
        } else {
          ctx.putImageData(imageData, 0, 0);
        }

        // Handle node-canvas's synchronous toBuffer vs browser's async toBlob
        if (typeof document === 'undefined') {
          // Node.js - use toBuffer
          const buffer = (canvas as any).toBuffer(mimeType);
          resolve(buffer.toString('base64'));
        } else {
          // Browser - use toBlob
          canvas.toBlob((blob) => {
            if (blob) {
              this.blobToBase64(blob).then(resolve);
            } else {
              reject(new Error('Failed to create blob from canvas'));
            }
          }, mimeType, quality);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create canvas element
   */
  private createCanvas(width: number, height: number): HTMLCanvasElement {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }

    // Node.js fallback - use canvas package
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas } = require('canvas');
    return createCanvas(width, height);
  }

  /**
   * Check if string looks like base64
   */
  private isBase64(str: string): boolean {
    if (str.length < 50) return false;
    return /^[A-Za-z0-9+/=]+$/.test(str.substring(0, 100));
  }
}
