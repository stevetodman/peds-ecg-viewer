/**
 * Analyze Muse EKG reference images to extract exact colors
 * Run with: node scripts/analyze-colors.js
 */

import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const SAMPLES_DIR = './reference/muse_samples';

/**
 * Get pixel color at x,y
 */
function getPixel(png, x, y) {
  const idx = (png.width * y + x) << 2;
  return {
    r: png.data[idx],
    g: png.data[idx + 1],
    b: png.data[idx + 2],
    a: png.data[idx + 3],
  };
}

/**
 * Convert RGB to hex
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Sample colors from a region and find unique colors
 */
function sampleRegion(png, startX, startY, width, height) {
  const colors = new Map();

  for (let y = startY; y < startY + height && y < png.height; y++) {
    for (let x = startX; x < startX + width && x < png.width; x++) {
      const pixel = getPixel(png, x, y);
      const hex = rgbToHex(pixel.r, pixel.g, pixel.b);
      colors.set(hex, (colors.get(hex) || 0) + 1);
    }
  }

  // Sort by frequency
  return [...colors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([hex, count]) => ({ hex, count, percent: ((count / (width * height)) * 100).toFixed(1) }));
}

/**
 * Analyze a horizontal line for color transitions (to find grid lines)
 */
function analyzeHorizontalLine(png, y, startX, endX) {
  const colors = [];
  let lastColor = null;
  let runLength = 0;

  for (let x = startX; x < endX && x < png.width; x++) {
    const pixel = getPixel(png, x, y);
    const hex = rgbToHex(pixel.r, pixel.g, pixel.b);

    if (hex === lastColor) {
      runLength++;
    } else {
      if (lastColor && runLength > 0) {
        colors.push({ color: lastColor, length: runLength, startX: x - runLength });
      }
      lastColor = hex;
      runLength = 1;
    }
  }

  if (lastColor && runLength > 0) {
    colors.push({ color: lastColor, length: runLength, startX: endX - runLength });
  }

  return colors;
}

/**
 * Find grid line colors by looking for periodic color changes
 */
function findGridColors(png, gridAreaX, gridAreaY, gridAreaWidth, gridAreaHeight) {
  console.log('\n=== Analyzing Grid Area ===');
  console.log(`Region: (${gridAreaX}, ${gridAreaY}) - ${gridAreaWidth}x${gridAreaHeight}`);

  // Sample the center of the grid area
  const centerY = gridAreaY + Math.floor(gridAreaHeight / 2);
  const lineAnalysis = analyzeHorizontalLine(png, centerY, gridAreaX, gridAreaX + gridAreaWidth);

  // Group colors by frequency
  const colorCounts = new Map();
  for (const segment of lineAnalysis) {
    colorCounts.set(segment.color, (colorCounts.get(segment.color) || 0) + segment.length);
  }

  const sortedColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex, count]) => ({ hex, count }));

  console.log('\nMost common colors on horizontal line:');
  sortedColors.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.hex} - ${c.count} pixels`);
  });

  // Sample entire region
  console.log('\nColor distribution in grid region:');
  const regionColors = sampleRegion(png, gridAreaX, gridAreaY, gridAreaWidth, gridAreaHeight);
  regionColors.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.hex} - ${c.percent}%`);
  });

  return {
    lineColors: sortedColors,
    regionColors: regionColors,
  };
}

/**
 * Main analysis function
 */
async function analyzeImage(filepath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Analyzing: ${path.basename(filepath)}`);
  console.log('='.repeat(60));

  const data = fs.readFileSync(filepath);
  const png = PNG.sync.read(data);

  console.log(`\nImage dimensions: ${png.width} x ${png.height}`);

  // For Muse screenshots, the ECG grid is typically in the center/lower portion
  // Let's sample different regions to find the grid

  // Sample top-left corner (likely toolbar/header)
  console.log('\n--- Header Region (0-100, 0-50) ---');
  const headerColors = sampleRegion(png, 0, 0, 100, 50);
  headerColors.slice(0, 3).forEach(c => console.log(`  ${c.hex} - ${c.percent}%`));

  // Sample middle region (likely grid area)
  const midX = Math.floor(png.width * 0.2);
  const midY = Math.floor(png.height * 0.3);
  const gridWidth = Math.floor(png.width * 0.6);
  const gridHeight = Math.floor(png.height * 0.5);

  const gridAnalysis = findGridColors(png, midX, midY, gridWidth, gridHeight);

  // Look for pink/red tones (typical ECG paper)
  console.log('\n--- Pink/Red Spectrum Analysis ---');
  const pinkColors = gridAnalysis.regionColors.filter(c => {
    const r = parseInt(c.hex.slice(1, 3), 16);
    const g = parseInt(c.hex.slice(3, 5), 16);
    const b = parseInt(c.hex.slice(5, 7), 16);
    // Pink = high red, medium-high green, medium-high blue, with red > green and red > blue
    return r > 200 && g > 150 && b > 150 && r >= g && r >= b;
  });

  if (pinkColors.length > 0) {
    console.log('Pink tones found (likely ECG paper):');
    pinkColors.forEach(c => console.log(`  ${c.hex} - ${c.percent}%`));
  }

  // Look for potential grid line colors (darker than background)
  console.log('\n--- Potential Grid Lines (darker pinks) ---');
  const gridLineColors = gridAnalysis.regionColors.filter(c => {
    const r = parseInt(c.hex.slice(1, 3), 16);
    const g = parseInt(c.hex.slice(3, 5), 16);
    const b = parseInt(c.hex.slice(5, 7), 16);
    // Darker pink = red still dominant but lower values
    return r > 180 && r < 255 && g > 100 && g < 220 && b > 100 && b < 220 && r > g && r > b;
  });

  if (gridLineColors.length > 0) {
    console.log('Darker pink tones (likely grid lines):');
    gridLineColors.forEach(c => console.log(`  ${c.hex} - ${c.percent}%`));
  }

  return {
    dimensions: { width: png.width, height: png.height },
    gridAnalysis,
  };
}

// Main
async function main() {
  const files = fs.readdirSync(SAMPLES_DIR)
    .filter(f => f.endsWith('.png') && !f.startsWith('.'))
    .map(f => path.join(SAMPLES_DIR, f));

  console.log(`Found ${files.length} PNG files to analyze`);

  const results = [];
  for (const file of files) {
    try {
      const result = await analyzeImage(file);
      results.push({ file: path.basename(file), ...result });
    } catch (err) {
      console.error(`Error analyzing ${file}:`, err.message);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY - Most Common Grid Colors Across All Images');
  console.log('='.repeat(60));

  const allColors = new Map();
  for (const result of results) {
    if (result.gridAnalysis?.regionColors) {
      for (const c of result.gridAnalysis.regionColors) {
        const current = allColors.get(c.hex) || { count: 0, files: [] };
        current.count += parseFloat(c.percent);
        current.files.push(path.basename(result.file));
        allColors.set(c.hex, current);
      }
    }
  }

  const sortedAllColors = [...allColors.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);

  console.log('\nTop colors found across all images:');
  sortedAllColors.forEach(([hex, data], i) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    console.log(`  ${i + 1}. ${hex} (R:${r} G:${g} B:${b}) - score: ${data.count.toFixed(1)}`);
  });
}

main().catch(console.error);
