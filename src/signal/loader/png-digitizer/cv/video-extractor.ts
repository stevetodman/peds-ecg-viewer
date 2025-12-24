/**
 * Video Frame Extractor
 * Extracts ECG frames from video recordings of monitors
 *
 * Common use case: User records ECG monitor with phone camera.
 * This module extracts the best frame(s) for digitization.
 *
 * @module signal/loader/png-digitizer/cv/video-extractor
 */

/**
 * Video extraction options
 */
export interface VideoExtractionOptions {
  /** Maximum number of frames to extract (default: 10) */
  maxFrames?: number;

  /** Frame selection strategy */
  strategy?: 'quality' | 'interval' | 'all';

  /** Interval between frames in seconds (for 'interval' strategy) */
  intervalSeconds?: number;

  /** Minimum frame quality score (0-1, default: 0.5) */
  minQuality?: number;

  /** Skip first N seconds (often shaky) */
  skipSeconds?: number;

  /** Target resolution (for downscaling large videos) */
  targetWidth?: number;
}

/**
 * Extracted frame
 */
export interface ExtractedFrame {
  /** Frame image data */
  imageData: ImageData;

  /** Time in video (seconds) */
  timestamp: number;

  /** Frame number */
  frameNumber: number;

  /** Quality score (0-1) */
  quality: number;

  /** Issues detected */
  issues: FrameIssue[];
}

/**
 * Frame quality issue
 */
export interface FrameIssue {
  type: 'blur' | 'glare' | 'partial' | 'dark' | 'overexposed';
  severity: number; // 0-1
  description: string;
}

/**
 * Video extraction result
 */
export interface VideoExtractionResult {
  /** Successfully extracted frames */
  frames: ExtractedFrame[];

  /** Total frames in video */
  totalFrames: number;

  /** Video duration (seconds) */
  duration: number;

  /** Video dimensions */
  dimensions: { width: number; height: number };

  /** Best frame (highest quality) */
  bestFrame?: ExtractedFrame;

  /** Extraction warnings */
  warnings: string[];
}

/**
 * Video Frame Extractor class
 */
export class VideoExtractor {
  private options: Required<VideoExtractionOptions>;

  constructor(options: VideoExtractionOptions = {}) {
    this.options = {
      maxFrames: options.maxFrames ?? 10,
      strategy: options.strategy ?? 'quality',
      intervalSeconds: options.intervalSeconds ?? 1,
      minQuality: options.minQuality ?? 0.5,
      skipSeconds: options.skipSeconds ?? 0.5,
      targetWidth: options.targetWidth ?? 1920,
    };
  }

  /**
   * Extract frames from video file
   * Browser-only - uses HTMLVideoElement
   */
  async extract(source: File | Blob | string): Promise<VideoExtractionResult> {
    if (typeof document === 'undefined') {
      throw new Error('Video extraction is only available in browser environment');
    }

    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Load video
    const videoUrl = typeof source === 'string'
      ? source
      : URL.createObjectURL(source);

    try {
      await this.loadVideo(video, videoUrl);

      const duration = video.duration;
      const totalFrames = Math.ceil(duration * 30); // Assume 30fps
      const { videoWidth, videoHeight } = video;

      // Set canvas size (may downscale)
      const scale = Math.min(1, this.options.targetWidth / videoWidth);
      canvas.width = Math.round(videoWidth * scale);
      canvas.height = Math.round(videoHeight * scale);

      const warnings: string[] = [];

      // Extract frames based on strategy
      let frameTimestamps: number[] = [];

      switch (this.options.strategy) {
        case 'interval':
          frameTimestamps = this.getIntervalTimestamps(duration);
          break;
        case 'all':
          frameTimestamps = this.getAllTimestamps(duration, 30);
          break;
        case 'quality':
        default:
          frameTimestamps = this.getQualitySamplingTimestamps(duration);
          break;
      }

      const frames: ExtractedFrame[] = [];

      for (let i = 0; i < frameTimestamps.length && frames.length < this.options.maxFrames; i++) {
        const timestamp = frameTimestamps[i];

        try {
          const frame = await this.extractFrameAt(video, canvas, ctx, timestamp, i);

          if (frame.quality >= this.options.minQuality) {
            frames.push(frame);
          }
        } catch (error) {
          warnings.push(`Failed to extract frame at ${timestamp.toFixed(2)}s: ${error}`);
        }
      }

      // Find best frame
      const bestFrame = frames.reduce(
        (best, frame) => (!best || frame.quality > best.quality) ? frame : best,
        undefined as ExtractedFrame | undefined
      );

      return {
        frames,
        totalFrames,
        duration,
        dimensions: { width: videoWidth, height: videoHeight },
        bestFrame,
        warnings,
      };

    } finally {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(videoUrl);
      }
    }
  }

  /**
   * Load video and wait for metadata
   */
  private loadVideo(video: HTMLVideoElement, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = url;
      video.load();
    });
  }

  /**
   * Get timestamps for interval-based extraction
   */
  private getIntervalTimestamps(duration: number): number[] {
    const timestamps: number[] = [];
    const start = this.options.skipSeconds;

    for (let t = start; t < duration; t += this.options.intervalSeconds) {
      timestamps.push(t);
    }

    return timestamps;
  }

  /**
   * Get all timestamps at given fps
   */
  private getAllTimestamps(duration: number, fps: number): number[] {
    const timestamps: number[] = [];
    const start = this.options.skipSeconds;
    const interval = 1 / fps;

    for (let t = start; t < duration; t += interval) {
      timestamps.push(t);
    }

    return timestamps;
  }

  /**
   * Get timestamps for quality-based sampling
   * Samples more densely to find best frames
   */
  private getQualitySamplingTimestamps(duration: number): number[] {
    const timestamps: number[] = [];
    const start = this.options.skipSeconds;
    const effectiveDuration = duration - start;

    // Sample at least every 0.5 seconds, more for shorter videos
    const interval = Math.min(0.5, effectiveDuration / (this.options.maxFrames * 3));

    for (let t = start; t < duration; t += interval) {
      timestamps.push(t);
    }

    return timestamps;
  }

  /**
   * Extract a single frame at given timestamp
   */
  private extractFrameAt(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    timestamp: number,
    frameNumber: number
  ): Promise<ExtractedFrame> {
    return new Promise((resolve, reject) => {
      const seekHandler = () => {
        video.removeEventListener('seeked', seekHandler);

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Assess quality
        const { quality, issues } = this.assessFrameQuality(imageData);

        resolve({
          imageData,
          timestamp,
          frameNumber,
          quality,
          issues,
        });
      };

      video.addEventListener('seeked', seekHandler);
      video.currentTime = timestamp;

      // Timeout after 5 seconds
      setTimeout(() => {
        video.removeEventListener('seeked', seekHandler);
        reject(new Error('Seek timeout'));
      }, 5000);
    });
  }

  /**
   * Assess quality of extracted frame
   */
  private assessFrameQuality(imageData: ImageData): { quality: number; issues: FrameIssue[] } {
    const issues: FrameIssue[] = [];
    let quality = 1.0;

    const data = imageData.data;
    const pixelCount = imageData.width * imageData.height;

    // Check for blur using Laplacian variance
    const blurScore = this.calculateBlurScore(imageData);
    if (blurScore < 50) {
      issues.push({
        type: 'blur',
        severity: 1 - blurScore / 50,
        description: 'Frame appears blurry',
      });
      quality *= 0.5 + (blurScore / 100);
    }

    // Check brightness distribution
    let darkPixels = 0;
    let brightPixels = 0;
    let sumBrightness = 0;

    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sumBrightness += brightness;

      if (brightness < 30) darkPixels++;
      if (brightness > 225) brightPixels++;
    }

    const avgBrightness = sumBrightness / pixelCount;
    const darkPercent = darkPixels / pixelCount;
    const brightPercent = brightPixels / pixelCount;

    // Check for underexposure
    if (avgBrightness < 50 || darkPercent > 0.5) {
      issues.push({
        type: 'dark',
        severity: (50 - avgBrightness) / 50,
        description: 'Frame is too dark',
      });
      quality *= 0.7;
    }

    // Check for overexposure
    if (avgBrightness > 200 || brightPercent > 0.4) {
      issues.push({
        type: 'overexposed',
        severity: (avgBrightness - 200) / 55,
        description: 'Frame is overexposed',
      });
      quality *= 0.8;
    }

    // Check for glare (localized bright spots)
    const glareScore = this.detectGlare(imageData);
    if (glareScore > 0.3) {
      issues.push({
        type: 'glare',
        severity: glareScore,
        description: 'Glare or reflection detected',
      });
      quality *= 1 - glareScore * 0.5;
    }

    return { quality: Math.max(0, Math.min(1, quality)), issues };
  }

  /**
   * Calculate blur score using Laplacian variance
   */
  private calculateBlurScore(imageData: ImageData): number {
    const { width, height, data } = imageData;

    // Convert to grayscale and calculate Laplacian
    let sumVariance = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;

        // Get neighbors
        const top = (data[((y - 1) * width + x) * 4] + data[((y - 1) * width + x) * 4 + 1] + data[((y - 1) * width + x) * 4 + 2]) / 3;
        const bottom = (data[((y + 1) * width + x) * 4] + data[((y + 1) * width + x) * 4 + 1] + data[((y + 1) * width + x) * 4 + 2]) / 3;
        const left = (data[(y * width + x - 1) * 4] + data[(y * width + x - 1) * 4 + 1] + data[(y * width + x - 1) * 4 + 2]) / 3;
        const right = (data[(y * width + x + 1) * 4] + data[(y * width + x + 1) * 4 + 1] + data[(y * width + x + 1) * 4 + 2]) / 3;

        // Laplacian
        const laplacian = Math.abs(4 * gray - top - bottom - left - right);
        sumVariance += laplacian * laplacian;
        count++;
      }
    }

    // Return variance (higher = sharper)
    return Math.sqrt(sumVariance / count);
  }

  /**
   * Detect glare in image
   */
  private detectGlare(imageData: ImageData): number {
    const { width, height, data } = imageData;

    // Look for clusters of very bright pixels
    let glarePixels = 0;
    const threshold = 250;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Check if all channels are very bright (white glare)
      if (r > threshold && g > threshold && b > threshold) {
        glarePixels++;
      }
    }

    const glarePercent = glarePixels / (width * height);

    // More than 5% glare is significant
    return Math.min(1, glarePercent * 20);
  }

  /**
   * Extract best frame from video
   */
  async extractBestFrame(source: File | Blob | string): Promise<ExtractedFrame | null> {
    const result = await this.extract(source);
    return result.bestFrame || null;
  }
}

/**
 * Convenience function for video frame extraction
 */
export async function extractVideoFrames(
  source: File | Blob | string,
  options?: VideoExtractionOptions
): Promise<VideoExtractionResult> {
  const extractor = new VideoExtractor(options);
  return extractor.extract(source);
}

/**
 * Convenience function to get best frame from video
 */
export async function extractBestVideoFrame(
  source: File | Blob | string,
  options?: VideoExtractionOptions
): Promise<ExtractedFrame | null> {
  const extractor = new VideoExtractor(options);
  return extractor.extractBestFrame(source);
}

/**
 * Check if file is a supported video format
 */
export function isVideoFile(file: File): boolean {
  const videoTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
  ];

  if (videoTypes.includes(file.type)) {
    return true;
  }

  // Check extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v'];

  return ext ? videoExtensions.includes(ext) : false;
}
