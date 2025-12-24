/**
 * PDF ECG Extractor
 * Extract ECG images from PDF documents
 *
 * @module signal/loader/png-digitizer/cv/pdf-extractor
 */

/**
 * PDF extraction result
 */
export interface PDFExtractionResult {
  /** Extracted pages as ImageData */
  pages: PDFPage[];

  /** Total number of pages in PDF */
  totalPages: number;

  /** PDF metadata */
  metadata: PDFMetadata;

  /** Extraction success */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Single PDF page
 */
export interface PDFPage {
  /** Page number (1-indexed) */
  pageNumber: number;

  /** Page as ImageData */
  imageData: ImageData;

  /** Page dimensions in points */
  dimensions: {
    width: number;
    height: number;
  };

  /** Detected as ECG page */
  isECGPage: boolean;

  /** Confidence that this is an ECG */
  ecgConfidence: number;

  /** Render scale used */
  scale: number;
}

/**
 * PDF metadata
 */
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

/**
 * PDF extraction options
 */
export interface PDFExtractionOptions {
  /** Render scale (default: 2 for 144 DPI) */
  scale?: number;

  /** Only extract pages that look like ECGs */
  ecgPagesOnly?: boolean;

  /** Maximum pages to extract (default: 10) */
  maxPages?: number;

  /** Page numbers to extract (1-indexed) */
  pageNumbers?: number[];
}

/**
 * PDF ECG Extractor
 *
 * Uses pdf.js for PDF rendering in browser environments.
 * In Node.js, falls back to external tools or throws error.
 */
export class PDFExtractor {
  private options: Required<PDFExtractionOptions>;

  constructor(options: PDFExtractionOptions = {}) {
    this.options = {
      scale: options.scale ?? 2,
      ecgPagesOnly: options.ecgPagesOnly ?? true,
      maxPages: options.maxPages ?? 10,
      pageNumbers: options.pageNumbers ?? [],
    };
  }

  /**
   * Extract images from PDF
   */
  async extract(source: ArrayBuffer | Blob | string): Promise<PDFExtractionResult> {
    try {
      // Get PDF data as ArrayBuffer
      const data = await this.loadPDFData(source);

      // Check if we're in browser with pdf.js available
      if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
        return await this.extractWithPdfJs(data);
      }

      // Try Node.js extraction
      if (typeof process !== 'undefined') {
        return await this.extractInNode(data);
      }

      return {
        pages: [],
        totalPages: 0,
        metadata: {},
        success: false,
        error: 'PDF extraction not supported in this environment. Include pdf.js for browser support.',
      };
    } catch (error) {
      return {
        pages: [],
        totalPages: 0,
        metadata: {},
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Load PDF data from various sources
   */
  private async loadPDFData(source: ArrayBuffer | Blob | string): Promise<ArrayBuffer> {
    if (source instanceof ArrayBuffer) {
      return source;
    }

    if (source instanceof Blob) {
      return await source.arrayBuffer();
    }

    // String - could be URL, file path, or base64
    if (typeof source === 'string') {
      // Data URL
      if (source.startsWith('data:')) {
        const base64 = source.split(',')[1];
        return this.base64ToArrayBuffer(base64);
      }

      // URL
      if (source.startsWith('http://') || source.startsWith('https://')) {
        const response = await fetch(source);
        return await response.arrayBuffer();
      }

      // File path (Node.js)
      if (typeof process !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs');
        const buffer = fs.readFileSync(source);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }

      // Assume base64
      return this.base64ToArrayBuffer(source);
    }

    throw new Error('Invalid PDF source');
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }

    // Node.js
    const buffer = Buffer.from(base64, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  /**
   * Extract using pdf.js (browser)
   */
  private async extractWithPdfJs(data: ArrayBuffer): Promise<PDFExtractionResult> {
    const pdfjsLib = (window as any).pdfjsLib;

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    const totalPages = pdf.numPages;
    const pages: PDFPage[] = [];

    // Extract metadata
    const metadataObj = await pdf.getMetadata();
    const metadata: PDFMetadata = {
      title: metadataObj?.info?.Title,
      author: metadataObj?.info?.Author,
      subject: metadataObj?.info?.Subject,
      creator: metadataObj?.info?.Creator,
      producer: metadataObj?.info?.Producer,
      creationDate: metadataObj?.info?.CreationDate ? new Date(metadataObj.info.CreationDate) : undefined,
      modificationDate: metadataObj?.info?.ModDate ? new Date(metadataObj.info.ModDate) : undefined,
    };

    // Determine which pages to extract
    const pageNums = this.options.pageNumbers.length > 0
      ? this.options.pageNumbers
      : Array.from({ length: Math.min(totalPages, this.options.maxPages) }, (_, i) => i + 1);

    for (const pageNum of pageNums) {
      if (pageNum < 1 || pageNum > totalPages) continue;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.options.scale });

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;

      // Render page
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      // Get ImageData
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Check if this looks like an ECG
      const { isECG, confidence } = this.detectECGPage(imageData);

      if (!this.options.ecgPagesOnly || isECG) {
        pages.push({
          pageNumber: pageNum,
          imageData,
          dimensions: {
            width: viewport.width / this.options.scale,
            height: viewport.height / this.options.scale,
          },
          isECGPage: isECG,
          ecgConfidence: confidence,
          scale: this.options.scale,
        });
      }
    }

    return {
      pages,
      totalPages,
      metadata,
      success: true,
    };
  }

  /**
   * Extract in Node.js environment
   */
  private async extractInNode(data: ArrayBuffer): Promise<PDFExtractionResult> {
    // Try to use canvas and pdfjs-dist
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

      // Set worker
      pdfjs.GlobalWorkerOptions.workerSrc = '';

      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;

      const totalPages = pdf.numPages;
      const pages: PDFPage[] = [];

      // Get metadata
      const metadataObj = await pdf.getMetadata();
      const metadata: PDFMetadata = {
        title: metadataObj?.info?.Title,
        author: metadataObj?.info?.Author,
      };

      // Determine pages
      const pageNums = this.options.pageNumbers.length > 0
        ? this.options.pageNumbers
        : Array.from({ length: Math.min(totalPages, this.options.maxPages) }, (_, i) => i + 1);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createCanvas } = require('canvas');

      for (const pageNum of pageNums) {
        if (pageNum < 1 || pageNum > totalPages) continue;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.options.scale });

        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');

        await page.render({
          canvasContext: ctx,
          viewport: viewport,
        }).promise;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { isECG, confidence } = this.detectECGPage(imageData);

        if (!this.options.ecgPagesOnly || isECG) {
          pages.push({
            pageNumber: pageNum,
            imageData,
            dimensions: {
              width: viewport.width / this.options.scale,
              height: viewport.height / this.options.scale,
            },
            isECGPage: isECG,
            ecgConfidence: confidence,
            scale: this.options.scale,
          });
        }
      }

      return {
        pages,
        totalPages,
        metadata,
        success: true,
      };
    } catch (error) {
      // Fallback: try external PDF tools
      return this.extractWithExternalTools(data);
    }
  }

  /**
   * Extract using external tools (pdftoppm, convert, etc.)
   */
  private async extractWithExternalTools(_data: ArrayBuffer): Promise<PDFExtractionResult> {
    // This would require writing to temp file and calling external tools
    // For now, return an error suggesting to install pdfjs-dist
    return {
      pages: [],
      totalPages: 0,
      metadata: {},
      success: false,
      error: 'PDF extraction in Node.js requires pdfjs-dist package. Install with: npm install pdfjs-dist canvas',
    };
  }

  /**
   * Detect if a page looks like an ECG
   */
  private detectECGPage(imageData: ImageData): { isECG: boolean; confidence: number } {
    const { width, height, data } = imageData;

    // Quick heuristics for ECG detection
    let gridPixels = 0;
    let waveformPixels = 0;
    let whitePixels = 0;

    const sampleStep = 4; // Sample every 4th pixel for speed

    for (let y = 0; y < height; y += sampleStep) {
      for (let x = 0; x < width; x += sampleStep) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Check for pink/red grid (common ECG grid)
        if (r > 200 && g > 150 && g < 220 && b > 150 && b < 220) {
          gridPixels++;
        }

        // Check for blue grid
        if (b > 180 && r < 180 && g > 150) {
          gridPixels++;
        }

        // Check for black waveform
        if (r < 80 && g < 80 && b < 80) {
          waveformPixels++;
        }

        // Check for white background
        if (r > 240 && g > 240 && b > 240) {
          whitePixels++;
        }
      }
    }

    const totalSamples = (width / sampleStep) * (height / sampleStep);
    const gridRatio = gridPixels / totalSamples;
    const waveformRatio = waveformPixels / totalSamples;
    const whiteRatio = whitePixels / totalSamples;

    // ECG typically has:
    // - Significant white background (>30%)
    // - Some grid lines (1-20%)
    // - Some waveform (1-15%)
    const isECG =
      whiteRatio > 0.3 &&
      gridRatio > 0.01 && gridRatio < 0.3 &&
      waveformRatio > 0.005 && waveformRatio < 0.2;

    // Calculate confidence
    let confidence = 0;
    if (whiteRatio > 0.5) confidence += 0.3;
    else if (whiteRatio > 0.3) confidence += 0.2;

    if (gridRatio > 0.02 && gridRatio < 0.2) confidence += 0.4;
    else if (gridRatio > 0.01 && gridRatio < 0.3) confidence += 0.2;

    if (waveformRatio > 0.01 && waveformRatio < 0.1) confidence += 0.3;
    else if (waveformRatio > 0.005 && waveformRatio < 0.2) confidence += 0.15;

    return {
      isECG,
      confidence: Math.min(1, confidence),
    };
  }
}

/**
 * Convenience function to extract ECGs from PDF
 */
export async function extractECGFromPDF(
  source: ArrayBuffer | Blob | string,
  options?: PDFExtractionOptions
): Promise<PDFExtractionResult> {
  const extractor = new PDFExtractor(options);
  return extractor.extract(source);
}

/**
 * Check if PDF extraction is supported in current environment
 */
export function isPDFExtractionSupported(): boolean {
  // Browser with pdf.js
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    return true;
  }

  // Node.js with pdfjs-dist
  if (typeof process !== 'undefined') {
    try {
      require.resolve('pdfjs-dist');
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
