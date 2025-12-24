/**
 * Geometry Utilities
 * Points, bounds, and geometric transformations
 *
 * @module signal/loader/png-digitizer/utils/geometry
 */

import type { Point, Bounds } from '../types';

/**
 * Calculate distance between two points
 */
export function pointDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if point is inside bounds
 */
export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/**
 * Get center of bounds
 */
export function boundsCenter(bounds: Bounds): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

/**
 * Check if two bounds overlap
 */
export function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Get intersection of two bounds
 */
export function boundsIntersection(a: Bounds, b: Bounds): Bounds | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  if (right <= x || bottom <= y) {
    return null;
  }

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

/**
 * Expand bounds by margin
 */
export function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + 2 * margin,
    height: bounds.height + 2 * margin,
  };
}

/**
 * Clamp bounds to image dimensions
 */
export function clampBounds(bounds: Bounds, width: number, height: number): Bounds {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(width, bounds.x + bounds.width);
  const bottom = Math.min(height, bounds.y + bounds.height);

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

/**
 * Linear interpolation between two points
 */
export function lerpPoint(p1: Point, p2: Point, t: number): Point {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}

/**
 * Calculate angle between two points (radians)
 */
export function pointAngle(p1: Point, p2: Point): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Rotate point around origin
 */
export function rotatePoint(point: Point, angle: number, origin: Point = { x: 0, y: 0 }): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Scale point relative to origin
 */
export function scalePoint(point: Point, scale: number, origin: Point = { x: 0, y: 0 }): Point {
  return {
    x: origin.x + (point.x - origin.x) * scale,
    y: origin.y + (point.y - origin.y) * scale,
  };
}
