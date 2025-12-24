/**
 * Perspective and Keystone Correction
 * Corrects photos of ECGs taken at an angle
 *
 * @module signal/loader/png-digitizer/cv/perspective-corrector
 */

import type { Point } from '../types';

/**
 * Perspective detection result
 */
export interface PerspectiveAnalysis {
  /** Is perspective distortion detected */
  hasDistortion: boolean;

  /** Severity of distortion (0-1) */
  severity: number;

  /** Detected corners of the ECG document */
  corners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  } | null;

  /** Estimated rotation angle (degrees) */
  rotationDeg: number;

  /** Estimated keystone angle (degrees) - vertical tilt */
  keystoneVerticalDeg: number;

  /** Estimated keystone angle (degrees) - horizontal tilt */
  keystoneHorizontalDeg: number;

  /** Confidence in detection */
  confidence: number;
}

/**
 * Perspective correction result
 */
export interface PerspectiveCorrectionResult {
  /** Corrected image data */
  imageData: ImageData;

  /** Transform matrix applied */
  transformMatrix: number[];

  /** Original corners mapped to corrected image */
  mappedCorners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  };

  /** Correction applied */
  correctionApplied: boolean;
}

/**
 * Perspective corrector class
 */
export class PerspectiveCorrector {
  private width: number;
  private height: number;
  private data: Uint8ClampedArray;

  constructor(imageData: ImageData) {
    this.width = imageData.width;
    this.height = imageData.height;
    this.data = imageData.data;
  }

  /**
   * Analyze image for perspective distortion
   */
  analyze(): PerspectiveAnalysis {
    // Detect document edges using gradient analysis
    const edges = this.detectEdges();

    // Find document corners using Hough-like line detection
    const lines = this.detectLines(edges);

    // Find intersection points (corners)
    const corners = this.findCorners(lines);

    if (!corners) {
      return {
        hasDistortion: false,
        severity: 0,
        corners: null,
        rotationDeg: 0,
        keystoneVerticalDeg: 0,
        keystoneHorizontalDeg: 0,
        confidence: 0,
      };
    }

    // Calculate distortion metrics
    const metrics = this.calculateDistortionMetrics(corners);

    return {
      hasDistortion: metrics.severity > 0.05,
      severity: metrics.severity,
      corners,
      rotationDeg: metrics.rotationDeg,
      keystoneVerticalDeg: metrics.keystoneVerticalDeg,
      keystoneHorizontalDeg: metrics.keystoneHorizontalDeg,
      confidence: metrics.confidence,
    };
  }

  /**
   * Correct perspective distortion
   */
  correct(analysis: PerspectiveAnalysis): PerspectiveCorrectionResult {
    if (!analysis.hasDistortion || !analysis.corners || analysis.severity < 0.05) {
      // No correction needed
      const data = new Uint8ClampedArray(this.data);
      return {
        imageData: this.createImageData(data, this.width, this.height),
        transformMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        mappedCorners: analysis.corners || {
          topLeft: { x: 0, y: 0 },
          topRight: { x: this.width, y: 0 },
          bottomLeft: { x: 0, y: this.height },
          bottomRight: { x: this.width, y: this.height },
        },
        correctionApplied: false,
      };
    }

    // Calculate homography matrix
    const { corners } = analysis;
    const targetCorners = this.calculateTargetCorners(corners);
    const matrix = this.computeHomography(corners, targetCorners);

    // Apply perspective transform
    const { imageData, mappedCorners } = this.applyTransform(matrix, targetCorners);

    return {
      imageData,
      transformMatrix: matrix,
      mappedCorners,
      correctionApplied: true,
    };
  }

  /**
   * Detect edges using Sobel operator
   */
  private detectEdges(): Uint8Array {
    const edges = new Uint8Array(this.width * this.height);
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        let gx = 0;
        let gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * this.width + (x + kx)) * 4;
            const gray = (this.data[idx] + this.data[idx + 1] + this.data[idx + 2]) / 3;
            const kidx = (ky + 1) * 3 + (kx + 1);
            gx += gray * sobelX[kidx];
            gy += gray * sobelY[kidx];
          }
        }

        edges[y * this.width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      }
    }

    return edges;
  }

  /**
   * Detect lines using simplified Hough transform
   */
  private detectLines(edges: Uint8Array): Array<{ rho: number; theta: number; votes: number }> {
    const lines: Array<{ rho: number; theta: number; votes: number }> = [];
    const thetaSteps = 180;
    const rhoMax = Math.sqrt(this.width * this.width + this.height * this.height);
    const rhoSteps = Math.floor(rhoMax * 2);

    // Accumulator
    const accumulator = new Uint32Array(thetaSteps * rhoSteps);

    // Vote for lines
    const edgeThreshold = 100;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (edges[y * this.width + x] > edgeThreshold) {
          for (let t = 0; t < thetaSteps; t++) {
            const theta = (t * Math.PI) / thetaSteps;
            const rho = x * Math.cos(theta) + y * Math.sin(theta);
            const rhoIdx = Math.floor((rho + rhoMax) * rhoSteps / (2 * rhoMax));
            if (rhoIdx >= 0 && rhoIdx < rhoSteps) {
              accumulator[t * rhoSteps + rhoIdx]++;
            }
          }
        }
      }
    }

    // Find peaks in accumulator
    const threshold = Math.max(...accumulator) * 0.3;
    for (let t = 0; t < thetaSteps; t++) {
      for (let r = 0; r < rhoSteps; r++) {
        const votes = accumulator[t * rhoSteps + r];
        if (votes > threshold) {
          const theta = (t * Math.PI) / thetaSteps;
          const rho = (r * 2 * rhoMax / rhoSteps) - rhoMax;
          lines.push({ rho, theta, votes });
        }
      }
    }

    // Sort by votes and take top lines
    lines.sort((a, b) => b.votes - a.votes);

    // Filter to get roughly horizontal and vertical lines
    const horizontalLines = lines.filter(l =>
      Math.abs(l.theta - Math.PI / 2) < 0.3 || Math.abs(l.theta - 3 * Math.PI / 2) < 0.3
    ).slice(0, 4);

    const verticalLines = lines.filter(l =>
      Math.abs(l.theta) < 0.3 || Math.abs(l.theta - Math.PI) < 0.3
    ).slice(0, 4);

    return [...horizontalLines, ...verticalLines];
  }

  /**
   * Find document corners from detected lines
   */
  private findCorners(lines: Array<{ rho: number; theta: number; votes: number }>): {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  } | null {
    // Separate horizontal and vertical lines
    const horizontal = lines.filter(l =>
      Math.abs(l.theta - Math.PI / 2) < 0.5
    );
    const vertical = lines.filter(l =>
      Math.abs(l.theta) < 0.5 || Math.abs(l.theta - Math.PI) < 0.5
    );

    if (horizontal.length < 2 || vertical.length < 2) {
      // Not enough lines detected, use image boundaries
      return null;
    }

    // Sort by position
    horizontal.sort((a, b) => a.rho - b.rho);
    vertical.sort((a, b) => a.rho - b.rho);

    // Get boundary lines
    const topLine = horizontal[0];
    const bottomLine = horizontal[horizontal.length - 1];
    const leftLine = vertical[0];
    const rightLine = vertical[vertical.length - 1];

    // Calculate intersections
    const topLeft = this.lineIntersection(topLine, leftLine);
    const topRight = this.lineIntersection(topLine, rightLine);
    const bottomLeft = this.lineIntersection(bottomLine, leftLine);
    const bottomRight = this.lineIntersection(bottomLine, rightLine);

    if (!topLeft || !topRight || !bottomLeft || !bottomRight) {
      return null;
    }

    // Validate corners are within image bounds (with margin)
    const margin = Math.min(this.width, this.height) * 0.1;
    const isValid = (p: Point) =>
      p.x >= -margin && p.x <= this.width + margin &&
      p.y >= -margin && p.y <= this.height + margin;

    if (!isValid(topLeft) || !isValid(topRight) || !isValid(bottomLeft) || !isValid(bottomRight)) {
      return null;
    }

    return { topLeft, topRight, bottomLeft, bottomRight };
  }

  /**
   * Calculate intersection of two lines in rho-theta form
   */
  private lineIntersection(
    line1: { rho: number; theta: number },
    line2: { rho: number; theta: number }
  ): Point | null {
    const { rho: rho1, theta: theta1 } = line1;
    const { rho: rho2, theta: theta2 } = line2;

    const denom = Math.cos(theta1) * Math.sin(theta2) - Math.sin(theta1) * Math.cos(theta2);
    if (Math.abs(denom) < 1e-10) {
      return null; // Lines are parallel
    }

    const x = (rho1 * Math.sin(theta2) - rho2 * Math.sin(theta1)) / denom;
    const y = (rho2 * Math.cos(theta1) - rho1 * Math.cos(theta2)) / denom;

    return { x, y };
  }

  /**
   * Calculate distortion metrics from corners
   */
  private calculateDistortionMetrics(corners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  }): {
    severity: number;
    rotationDeg: number;
    keystoneVerticalDeg: number;
    keystoneHorizontalDeg: number;
    confidence: number;
  } {
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;

    // Calculate edge lengths
    const topWidth = Math.sqrt(
      Math.pow(topRight.x - topLeft.x, 2) + Math.pow(topRight.y - topLeft.y, 2)
    );
    const bottomWidth = Math.sqrt(
      Math.pow(bottomRight.x - bottomLeft.x, 2) + Math.pow(bottomRight.y - bottomLeft.y, 2)
    );
    const leftHeight = Math.sqrt(
      Math.pow(bottomLeft.x - topLeft.x, 2) + Math.pow(bottomLeft.y - topLeft.y, 2)
    );
    const rightHeight = Math.sqrt(
      Math.pow(bottomRight.x - topRight.x, 2) + Math.pow(bottomRight.y - topRight.y, 2)
    );

    // Calculate rotation from top edge
    const rotationRad = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);
    const rotationDeg = (rotationRad * 180) / Math.PI;

    // Calculate keystone (perspective) distortion
    const widthRatio = topWidth / bottomWidth;
    const heightRatio = leftHeight / rightHeight;

    const keystoneVerticalDeg = Math.atan(1 - widthRatio) * (180 / Math.PI) * 10;
    const keystoneHorizontalDeg = Math.atan(1 - heightRatio) * (180 / Math.PI) * 10;

    // Calculate severity (0-1)
    const rotationSeverity = Math.min(1, Math.abs(rotationDeg) / 15);
    const keystoneSeverity = Math.min(1, (Math.abs(1 - widthRatio) + Math.abs(1 - heightRatio)) * 2);
    const severity = Math.max(rotationSeverity, keystoneSeverity);

    // Confidence based on corner detection quality
    const expectedAspectRatio = this.width / this.height;
    const detectedAspectRatio = (topWidth + bottomWidth) / 2 / ((leftHeight + rightHeight) / 2);
    const aspectRatioError = Math.abs(expectedAspectRatio - detectedAspectRatio) / expectedAspectRatio;
    const confidence = Math.max(0, 1 - aspectRatioError);

    return {
      severity,
      rotationDeg,
      keystoneVerticalDeg,
      keystoneHorizontalDeg,
      confidence,
    };
  }

  /**
   * Calculate target (corrected) corners
   */
  private calculateTargetCorners(sourceCorners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  }): {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  } {
    // Calculate average dimensions
    const topWidth = Math.sqrt(
      Math.pow(sourceCorners.topRight.x - sourceCorners.topLeft.x, 2) +
      Math.pow(sourceCorners.topRight.y - sourceCorners.topLeft.y, 2)
    );
    const bottomWidth = Math.sqrt(
      Math.pow(sourceCorners.bottomRight.x - sourceCorners.bottomLeft.x, 2) +
      Math.pow(sourceCorners.bottomRight.y - sourceCorners.bottomLeft.y, 2)
    );
    const leftHeight = Math.sqrt(
      Math.pow(sourceCorners.bottomLeft.x - sourceCorners.topLeft.x, 2) +
      Math.pow(sourceCorners.bottomLeft.y - sourceCorners.topLeft.y, 2)
    );
    const rightHeight = Math.sqrt(
      Math.pow(sourceCorners.bottomRight.x - sourceCorners.topRight.x, 2) +
      Math.pow(sourceCorners.bottomRight.y - sourceCorners.topRight.y, 2)
    );

    const width = Math.max(topWidth, bottomWidth);
    const height = Math.max(leftHeight, rightHeight);

    // Center in image
    const offsetX = (this.width - width) / 2;
    const offsetY = (this.height - height) / 2;

    return {
      topLeft: { x: offsetX, y: offsetY },
      topRight: { x: offsetX + width, y: offsetY },
      bottomLeft: { x: offsetX, y: offsetY + height },
      bottomRight: { x: offsetX + width, y: offsetY + height },
    };
  }

  /**
   * Compute 3x3 homography matrix
   */
  private computeHomography(
    src: { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point },
    dst: { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point }
  ): number[] {
    // Build the system of equations for homography
    const srcPts = [src.topLeft, src.topRight, src.bottomRight, src.bottomLeft];
    const dstPts = [dst.topLeft, dst.topRight, dst.bottomRight, dst.bottomLeft];

    // 8x8 matrix for solving homography
    const A: number[][] = [];
    const b: number[] = [];

    for (let i = 0; i < 4; i++) {
      const sx = srcPts[i].x;
      const sy = srcPts[i].y;
      const dx = dstPts[i].x;
      const dy = dstPts[i].y;

      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
      b.push(dx);
      b.push(dy);
    }

    // Solve using Gaussian elimination (simplified)
    const h = this.solveLinearSystem(A, b);

    // Return 3x3 matrix as flat array
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  /**
   * Solve linear system Ax = b using Gaussian elimination
   */
  private solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = b.length;
    const augmented = A.map((row, i) => [...row, b[i]]);

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Eliminate column
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }

    return x;
  }

  /**
   * Apply homography transform to image
   */
  private applyTransform(
    matrix: number[],
    targetCorners: { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point }
  ): {
    imageData: ImageData;
    mappedCorners: { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point };
  } {
    const newData = new Uint8ClampedArray(this.width * this.height * 4);

    // Compute inverse matrix for backward mapping
    const invMatrix = this.invertMatrix3x3(matrix);

    // Apply transform using backward mapping
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Apply inverse homography to find source pixel
        const w = invMatrix[6] * x + invMatrix[7] * y + invMatrix[8];
        const srcX = (invMatrix[0] * x + invMatrix[1] * y + invMatrix[2]) / w;
        const srcY = (invMatrix[3] * x + invMatrix[4] * y + invMatrix[5]) / w;

        // Bilinear interpolation
        const color = this.bilinearInterpolate(srcX, srcY);

        const dstIdx = (y * this.width + x) * 4;
        newData[dstIdx] = color.r;
        newData[dstIdx + 1] = color.g;
        newData[dstIdx + 2] = color.b;
        newData[dstIdx + 3] = 255;
      }
    }

    return {
      imageData: this.createImageData(newData, this.width, this.height),
      mappedCorners: targetCorners,
    };
  }

  /**
   * Invert 3x3 matrix
   */
  private invertMatrix3x3(m: number[]): number[] {
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]);

    if (Math.abs(det) < 1e-10) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1]; // Identity if singular
    }

    const invDet = 1 / det;

    return [
      (m[4] * m[8] - m[5] * m[7]) * invDet,
      (m[2] * m[7] - m[1] * m[8]) * invDet,
      (m[1] * m[5] - m[2] * m[4]) * invDet,
      (m[5] * m[6] - m[3] * m[8]) * invDet,
      (m[0] * m[8] - m[2] * m[6]) * invDet,
      (m[2] * m[3] - m[0] * m[5]) * invDet,
      (m[3] * m[7] - m[4] * m[6]) * invDet,
      (m[1] * m[6] - m[0] * m[7]) * invDet,
      (m[0] * m[4] - m[1] * m[3]) * invDet,
    ];
  }

  /**
   * Bilinear interpolation for sub-pixel sampling
   */
  private bilinearInterpolate(x: number, y: number): { r: number; g: number; b: number } {
    if (x < 0 || x >= this.width - 1 || y < 0 || y >= this.height - 1) {
      return { r: 255, g: 255, b: 255 }; // White for out-of-bounds
    }

    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const dx = x - x0;
    const dy = y - y0;

    const getPixel = (px: number, py: number) => {
      const idx = (py * this.width + px) * 4;
      return {
        r: this.data[idx],
        g: this.data[idx + 1],
        b: this.data[idx + 2],
      };
    };

    const p00 = getPixel(x0, y0);
    const p10 = getPixel(x1, y0);
    const p01 = getPixel(x0, y1);
    const p11 = getPixel(x1, y1);

    return {
      r: Math.round(
        p00.r * (1 - dx) * (1 - dy) +
        p10.r * dx * (1 - dy) +
        p01.r * (1 - dx) * dy +
        p11.r * dx * dy
      ),
      g: Math.round(
        p00.g * (1 - dx) * (1 - dy) +
        p10.g * dx * (1 - dy) +
        p01.g * (1 - dx) * dy +
        p11.g * dx * dy
      ),
      b: Math.round(
        p00.b * (1 - dx) * (1 - dy) +
        p10.b * dx * (1 - dy) +
        p01.b * (1 - dx) * dy +
        p11.b * dx * dy
      ),
    };
  }

  /**
   * Create ImageData (browser or Node.js compatible)
   */
  private createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
    if (typeof ImageData !== 'undefined') {
      // Create new array to ensure proper ArrayBuffer type
      const newData = new Uint8ClampedArray(data.length);
      newData.set(data);
      return new ImageData(newData, width, height);
    }
    return { data, width, height, colorSpace: 'srgb' } as ImageData;
  }
}

/**
 * Convenience function for perspective correction
 */
export function correctPerspective(imageData: ImageData): PerspectiveCorrectionResult {
  const corrector = new PerspectiveCorrector(imageData);
  const analysis = corrector.analyze();
  return corrector.correct(analysis);
}

/**
 * Analyze perspective distortion without correcting
 */
export function analyzePerspective(imageData: ImageData): PerspectiveAnalysis {
  const corrector = new PerspectiveCorrector(imageData);
  return corrector.analyze();
}
