/**
 * PHI (Protected Health Information) Detector
 * Detects and optionally redacts patient information in ECG images
 *
 * Critical for HIPAA compliance - ECG images often contain:
 * - Patient name
 * - Medical Record Number (MRN)
 * - Date of birth
 * - Social Security Number
 * - Account numbers
 * - Dates of service
 *
 * @module signal/loader/png-digitizer/cv/phi-detector
 */

/**
 * Types of PHI that can be detected
 */
export type PHIType =
  | 'name'
  | 'mrn'
  | 'dob'
  | 'ssn'
  | 'account_number'
  | 'date'
  | 'phone'
  | 'address'
  | 'email'
  | 'age'
  | 'physician'
  | 'facility'
  | 'unknown_text';

/**
 * Detected PHI region
 */
export interface PHIRegion {
  /** Type of PHI detected */
  type: PHIType;

  /** Bounding box of the region */
  bounds: { x: number; y: number; width: number; height: number };

  /** Confidence of detection (0-1) */
  confidence: number;

  /** The detected text (if OCR available) */
  text?: string;

  /** Risk level */
  riskLevel: 'high' | 'medium' | 'low';
}

/**
 * PHI detection result
 */
export interface PHIDetectionResult {
  /** Whether any PHI was detected */
  hasPHI: boolean;

  /** All detected PHI regions */
  regions: PHIRegion[];

  /** Overall risk assessment */
  riskLevel: 'high' | 'medium' | 'low' | 'none';

  /** Specific warnings */
  warnings: string[];

  /** Recommended actions */
  recommendations: string[];

  /** Detection method used */
  method: 'pattern' | 'ocr' | 'ai' | 'hybrid';
}

/**
 * PHI redaction options
 */
export interface PHIRedactionOptions {
  /** Redaction style */
  style: 'black_box' | 'white_box' | 'blur' | 'pixelate';

  /** Padding around detected regions (pixels) */
  padding: number;

  /** Types of PHI to redact (default: all) */
  typesToRedact?: PHIType[];

  /** Minimum confidence to redact (0-1) */
  minConfidence: number;
}

/**
 * Common ECG header regions where PHI typically appears
 */
interface HeaderRegion {
  name: string;
  relativeX: number; // 0-1 relative to image width
  relativeY: number; // 0-1 relative to image height
  relativeWidth: number;
  relativeHeight: number;
  likelyContains: PHIType[];
}

/**
 * PHI Detector class
 */
export class PHIDetector {
  private imageData: ImageData;
  private width: number;
  private height: number;

  // Common ECG header layouts where PHI appears
  private static readonly HEADER_REGIONS: HeaderRegion[] = [
    // Top-left: Usually patient name and ID
    { name: 'top_left', relativeX: 0, relativeY: 0, relativeWidth: 0.35, relativeHeight: 0.12, likelyContains: ['name', 'mrn', 'dob'] },
    // Top-center: Usually facility info
    { name: 'top_center', relativeX: 0.35, relativeY: 0, relativeWidth: 0.30, relativeHeight: 0.10, likelyContains: ['facility', 'date'] },
    // Top-right: Usually dates and physician
    { name: 'top_right', relativeX: 0.65, relativeY: 0, relativeWidth: 0.35, relativeHeight: 0.12, likelyContains: ['date', 'physician', 'account_number'] },
    // Bottom: Sometimes has additional info
    { name: 'bottom', relativeX: 0, relativeY: 0.92, relativeWidth: 1, relativeHeight: 0.08, likelyContains: ['facility', 'physician', 'date'] },
  ];

  // Patterns for PHI detection - available for future OCR integration
  // These patterns match common PHI formats in ECG headers
  static readonly PHI_PATTERNS: ReadonlyArray<{ type: PHIType; pattern: RegExp; riskLevel: 'high' | 'medium' | 'low' }> = [
    // SSN: XXX-XX-XXXX
    { type: 'ssn', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/, riskLevel: 'high' },
    // MRN: Various formats
    { type: 'mrn', pattern: /\b(MRN|MR#?|Medical Record|Patient ID|ID)[:\s#]*[\dA-Z]{4,12}\b/i, riskLevel: 'high' },
    // DOB patterns
    { type: 'dob', pattern: /\b(DOB|D\.O\.B\.|Birth|Born)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/i, riskLevel: 'high' },
    // Age with context
    { type: 'age', pattern: /\b(Age|AGE)[:\s]*\d{1,3}\s*(yr?s?|years?|y\.?o\.?|YO)?\b/i, riskLevel: 'medium' },
    // Phone numbers
    { type: 'phone', pattern: /\b(\+1[-\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/, riskLevel: 'medium' },
    // Email addresses
    { type: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, riskLevel: 'medium' },
    // Account numbers
    { type: 'account_number', pattern: /\b(Acct?#?|Account)[:\s#]*[\dA-Z]{6,15}\b/i, riskLevel: 'high' },
    // Name patterns (common labels)
    { type: 'name', pattern: /\b(Patient|Name|Pt)[:\s]+[A-Z][a-z]+[,\s]+[A-Z][a-z]+/i, riskLevel: 'high' },
    // Physician
    { type: 'physician', pattern: /\b(Dr\.?|MD|Physician|Referred by|Ordering)[:\s]+[A-Z][a-z]+/i, riskLevel: 'low' },
  ];

  constructor(imageData: ImageData) {
    this.imageData = imageData;
    this.width = imageData.width;
    this.height = imageData.height;
  }

  /**
   * Detect PHI regions in the image
   */
  detect(): PHIDetectionResult {
    const regions: PHIRegion[] = [];
    const warnings: string[] = [];

    // Strategy 1: Detect text-heavy regions in header/footer
    // Reserved for future enhanced detection
    this.detectTextRegions();

    // Strategy 2: Map to known PHI locations
    for (const headerRegion of PHIDetector.HEADER_REGIONS) {
      const bounds = {
        x: Math.floor(headerRegion.relativeX * this.width),
        y: Math.floor(headerRegion.relativeY * this.height),
        width: Math.floor(headerRegion.relativeWidth * this.width),
        height: Math.floor(headerRegion.relativeHeight * this.height),
      };

      // Check if this region has text content
      const hasText = this.regionHasTextContent(bounds);
      if (hasText.hasText) {
        regions.push({
          type: headerRegion.likelyContains[0] || 'unknown_text',
          bounds,
          confidence: hasText.confidence,
          riskLevel: this.getRegionRiskLevel(headerRegion.likelyContains),
        });

        warnings.push(`Potential ${headerRegion.likelyContains.join('/')} detected in ${headerRegion.name} region`);
      }
    }

    // Strategy 3: Look for specific visual patterns
    const labelRegions = this.detectLabeledFields();
    regions.push(...labelRegions);

    // Deduplicate overlapping regions
    const dedupedRegions = this.deduplicateRegions(regions);

    // Calculate overall risk
    const riskLevel = this.calculateOverallRisk(dedupedRegions);

    // Generate recommendations
    const recommendations = this.generateRecommendations(dedupedRegions, riskLevel);

    return {
      hasPHI: dedupedRegions.length > 0,
      regions: dedupedRegions,
      riskLevel,
      warnings,
      recommendations,
      method: 'pattern',
    };
  }

  /**
   * Detect regions that appear to contain text
   */
  private detectTextRegions(): Array<{ bounds: { x: number; y: number; width: number; height: number }; density: number }> {
    const regions: Array<{ bounds: { x: number; y: number; width: number; height: number }; density: number }> = [];

    // Scan in blocks to find high-contrast text regions
    const blockSize = 50;

    for (let y = 0; y < this.height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < this.width - blockSize; x += blockSize / 2) {
        const stats = this.getBlockStatistics(x, y, blockSize, blockSize);

        // Text regions have high contrast and moderate edge density
        if (stats.contrast > 100 && stats.edgeDensity > 0.1 && stats.edgeDensity < 0.5) {
          regions.push({
            bounds: { x, y, width: blockSize, height: blockSize },
            density: stats.edgeDensity,
          });
        }
      }
    }

    return regions;
  }

  /**
   * Get statistics for an image block
   */
  private getBlockStatistics(
    x: number,
    y: number,
    width: number,
    height: number
  ): { contrast: number; edgeDensity: number; meanBrightness: number } {
    const { data } = this.imageData;
    let minBrightness = 255;
    let maxBrightness = 0;
    let sumBrightness = 0;
    let edgeCount = 0;
    let pixelCount = 0;

    for (let py = y; py < y + height && py < this.height; py++) {
      for (let px = x; px < x + width && px < this.width; px++) {
        const idx = (py * this.width + px) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

        minBrightness = Math.min(minBrightness, brightness);
        maxBrightness = Math.max(maxBrightness, brightness);
        sumBrightness += brightness;
        pixelCount++;

        // Check horizontal edge
        if (px < x + width - 1 && px < this.width - 1) {
          const nextIdx = (py * this.width + px + 1) * 4;
          const nextBrightness = (data[nextIdx] + data[nextIdx + 1] + data[nextIdx + 2]) / 3;
          if (Math.abs(brightness - nextBrightness) > 50) {
            edgeCount++;
          }
        }
      }
    }

    return {
      contrast: maxBrightness - minBrightness,
      edgeDensity: edgeCount / pixelCount,
      meanBrightness: sumBrightness / pixelCount,
    };
  }

  /**
   * Check if a region contains text-like content
   */
  private regionHasTextContent(bounds: { x: number; y: number; width: number; height: number }): {
    hasText: boolean;
    confidence: number;
  } {
    const stats = this.getBlockStatistics(bounds.x, bounds.y, bounds.width, bounds.height);

    // Text regions typically have:
    // - High contrast (black text on white background)
    // - Moderate edge density (letters have edges but not filled)
    // - High mean brightness (mostly white background)

    const hasHighContrast = stats.contrast > 150;
    const hasTextEdges = stats.edgeDensity > 0.05 && stats.edgeDensity < 0.4;
    const hasLightBackground = stats.meanBrightness > 180;

    const score =
      (hasHighContrast ? 0.4 : 0) +
      (hasTextEdges ? 0.3 : 0) +
      (hasLightBackground ? 0.3 : 0);

    return {
      hasText: score > 0.5,
      confidence: score,
    };
  }

  /**
   * Detect labeled fields (e.g., "Name:", "DOB:", "MRN:")
   */
  private detectLabeledFields(): PHIRegion[] {
    // This is a placeholder for more sophisticated detection
    // In production, this would use OCR or trained models
    return [];
  }

  /**
   * Get risk level for a set of PHI types
   */
  private getRegionRiskLevel(types: PHIType[]): 'high' | 'medium' | 'low' {
    const highRisk: PHIType[] = ['ssn', 'mrn', 'dob', 'name', 'account_number'];
    const mediumRisk: PHIType[] = ['phone', 'address', 'email', 'age'];

    for (const type of types) {
      if (highRisk.includes(type)) return 'high';
    }
    for (const type of types) {
      if (mediumRisk.includes(type)) return 'medium';
    }
    return 'low';
  }

  /**
   * Remove overlapping regions, keeping highest confidence
   */
  private deduplicateRegions(regions: PHIRegion[]): PHIRegion[] {
    const result: PHIRegion[] = [];

    for (const region of regions) {
      let isDuplicate = false;

      for (let i = 0; i < result.length; i++) {
        if (this.regionsOverlap(region.bounds, result[i].bounds)) {
          // Keep the one with higher confidence
          if (region.confidence > result[i].confidence) {
            result[i] = region;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        result.push(region);
      }
    }

    return result;
  }

  /**
   * Check if two regions overlap significantly
   */
  private regionsOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): boolean {
    const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const overlapArea = overlapX * overlapY;
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);

    return overlapArea / smallerArea > 0.5;
  }

  /**
   * Calculate overall risk level
   */
  private calculateOverallRisk(regions: PHIRegion[]): 'high' | 'medium' | 'low' | 'none' {
    if (regions.length === 0) return 'none';

    const hasHigh = regions.some(r => r.riskLevel === 'high');
    const hasMedium = regions.some(r => r.riskLevel === 'medium');

    if (hasHigh) return 'high';
    if (hasMedium) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on detected PHI
   */
  private generateRecommendations(
    regions: PHIRegion[],
    riskLevel: 'high' | 'medium' | 'low' | 'none'
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'high') {
      recommendations.push('⚠️ HIGH RISK: This image appears to contain sensitive patient information');
      recommendations.push('Consider redacting PHI before sharing or storing');
      recommendations.push('Ensure HIPAA compliance for any processing or transmission');
    } else if (riskLevel === 'medium') {
      recommendations.push('This image may contain patient identifiers');
      recommendations.push('Review detected regions before sharing');
    } else if (riskLevel === 'low') {
      recommendations.push('Low-risk content detected; review if sharing publicly');
    }

    // Specific recommendations based on detected types
    const types = new Set(regions.map(r => r.type));

    if (types.has('ssn')) {
      recommendations.push('🔴 Social Security Number detected - MUST redact before any sharing');
    }
    if (types.has('name') || types.has('mrn')) {
      recommendations.push('Patient identifiers should be removed for de-identification');
    }
    if (types.has('dob')) {
      recommendations.push('Date of birth should be removed or generalized for HIPAA Safe Harbor');
    }

    return recommendations;
  }

  /**
   * Redact detected PHI regions from the image
   */
  redact(
    options: Partial<PHIRedactionOptions> = {}
  ): { imageData: ImageData; redactedCount: number } {
    const opts: PHIRedactionOptions = {
      style: options.style ?? 'black_box',
      padding: options.padding ?? 5,
      typesToRedact: options.typesToRedact,
      minConfidence: options.minConfidence ?? 0.5,
    };

    // Detect PHI
    const detection = this.detect();

    // Filter regions to redact
    let regionsToRedact = detection.regions.filter(r => r.confidence >= opts.minConfidence);

    if (opts.typesToRedact) {
      regionsToRedact = regionsToRedact.filter(r => opts.typesToRedact!.includes(r.type));
    }

    // Create a copy of the image data
    const newData = new Uint8ClampedArray(this.imageData.data);

    // Redact each region
    for (const region of regionsToRedact) {
      const bounds = {
        x: Math.max(0, region.bounds.x - opts.padding),
        y: Math.max(0, region.bounds.y - opts.padding),
        width: Math.min(this.width - region.bounds.x + opts.padding, region.bounds.width + 2 * opts.padding),
        height: Math.min(this.height - region.bounds.y + opts.padding, region.bounds.height + 2 * opts.padding),
      };

      this.applyRedaction(newData, bounds, opts.style);
    }

    return {
      imageData: new ImageData(newData, this.width, this.height),
      redactedCount: regionsToRedact.length,
    };
  }

  /**
   * Apply redaction to a region
   */
  private applyRedaction(
    data: Uint8ClampedArray,
    bounds: { x: number; y: number; width: number; height: number },
    style: 'black_box' | 'white_box' | 'blur' | 'pixelate'
  ): void {
    switch (style) {
      case 'black_box':
        this.fillRegion(data, bounds, 0, 0, 0);
        break;
      case 'white_box':
        this.fillRegion(data, bounds, 255, 255, 255);
        break;
      case 'blur':
        this.blurRegion(data, bounds, 10);
        break;
      case 'pixelate':
        this.pixelateRegion(data, bounds, 10);
        break;
    }
  }

  /**
   * Fill a region with solid color
   */
  private fillRegion(
    data: Uint8ClampedArray,
    bounds: { x: number; y: number; width: number; height: number },
    r: number,
    g: number,
    b: number
  ): void {
    for (let y = bounds.y; y < bounds.y + bounds.height && y < this.height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width && x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
  }

  /**
   * Blur a region
   */
  private blurRegion(
    data: Uint8ClampedArray,
    bounds: { x: number; y: number; width: number; height: number },
    radius: number
  ): void {
    // Simple box blur
    const tempData = new Uint8ClampedArray(data.length);

    for (let y = bounds.y; y < bounds.y + bounds.height && y < this.height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width && x < this.width; x++) {
        let r = 0, g = 0, b = 0, count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = Math.max(bounds.x, Math.min(bounds.x + bounds.width - 1, x + dx));
            const ny = Math.max(bounds.y, Math.min(bounds.y + bounds.height - 1, y + dy));
            const idx = (ny * this.width + nx) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }

        const idx = (y * this.width + x) * 4;
        tempData[idx] = r / count;
        tempData[idx + 1] = g / count;
        tempData[idx + 2] = b / count;
        tempData[idx + 3] = 255;
      }
    }

    // Copy back
    for (let y = bounds.y; y < bounds.y + bounds.height && y < this.height; y++) {
      for (let x = bounds.x; x < bounds.x + bounds.width && x < this.width; x++) {
        const idx = (y * this.width + x) * 4;
        data[idx] = tempData[idx];
        data[idx + 1] = tempData[idx + 1];
        data[idx + 2] = tempData[idx + 2];
        data[idx + 3] = tempData[idx + 3];
      }
    }
  }

  /**
   * Pixelate a region
   */
  private pixelateRegion(
    data: Uint8ClampedArray,
    bounds: { x: number; y: number; width: number; height: number },
    blockSize: number
  ): void {
    for (let y = bounds.y; y < bounds.y + bounds.height; y += blockSize) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += blockSize) {
        // Get average color of block
        let r = 0, g = 0, b = 0, count = 0;

        for (let dy = 0; dy < blockSize && y + dy < bounds.y + bounds.height && y + dy < this.height; dy++) {
          for (let dx = 0; dx < blockSize && x + dx < bounds.x + bounds.width && x + dx < this.width; dx++) {
            const idx = ((y + dy) * this.width + (x + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        // Fill block with average color
        for (let dy = 0; dy < blockSize && y + dy < bounds.y + bounds.height && y + dy < this.height; dy++) {
          for (let dx = 0; dx < blockSize && x + dx < bounds.x + bounds.width && x + dx < this.width; dx++) {
            const idx = ((y + dy) * this.width + (x + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }
  }
}

/**
 * Convenience function for PHI detection
 */
export function detectPHI(imageData: ImageData): PHIDetectionResult {
  const detector = new PHIDetector(imageData);
  return detector.detect();
}

/**
 * Convenience function for PHI redaction
 */
export function redactPHI(
  imageData: ImageData,
  options?: Partial<PHIRedactionOptions>
): { imageData: ImageData; redactedCount: number; detection: PHIDetectionResult } {
  const detector = new PHIDetector(imageData);
  const detection = detector.detect();
  const result = detector.redact(options);
  return { ...result, detection };
}
