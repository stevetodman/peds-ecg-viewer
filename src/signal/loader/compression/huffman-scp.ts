/**
 * Huffman Decoding for SCP-ECG Format
 *
 * Implements Huffman decoding using SCP-ECG standard tables.
 * Based on EN 1064:2005 / ANSI/AAMI EC71:2001 specifications.
 *
 * @module signal/loader/compression/huffman-scp
 */

/**
 * Huffman table entry
 */
export interface HuffmanEntry {
  /** Number of bits in the prefix */
  prefixBits: number;
  /** Prefix value */
  prefix: number;
  /** Number of additional bits to read */
  tableBits: number;
  /** Base value for this entry */
  baseValue: number;
}

/**
 * Complete Huffman table
 */
export interface HuffmanTable {
  entries: HuffmanEntry[];
}

/**
 * SCP-ECG Default Huffman Table #1
 * This is the standard table defined in the SCP-ECG specification
 */
export const SCP_DEFAULT_TABLE: HuffmanTable = {
  entries: [
    // Prefix bits, prefix, table bits, base value
    { prefixBits: 1, prefix: 0b0, tableBits: 0, baseValue: 0 },           // 0 -> 0
    { prefixBits: 3, prefix: 0b100, tableBits: 0, baseValue: 1 },         // 100 -> 1
    { prefixBits: 3, prefix: 0b101, tableBits: 0, baseValue: -1 },        // 101 -> -1
    { prefixBits: 4, prefix: 0b1100, tableBits: 0, baseValue: 2 },        // 1100 -> 2
    { prefixBits: 4, prefix: 0b1101, tableBits: 0, baseValue: -2 },       // 1101 -> -2
    { prefixBits: 5, prefix: 0b11100, tableBits: 0, baseValue: 3 },       // 11100 -> 3
    { prefixBits: 5, prefix: 0b11101, tableBits: 0, baseValue: -3 },      // 11101 -> -3
    { prefixBits: 6, prefix: 0b111100, tableBits: 0, baseValue: 4 },      // 111100 -> 4
    { prefixBits: 6, prefix: 0b111101, tableBits: 0, baseValue: -4 },     // 111101 -> -4
    { prefixBits: 7, prefix: 0b1111100, tableBits: 0, baseValue: 5 },     // 1111100 -> 5
    { prefixBits: 7, prefix: 0b1111101, tableBits: 0, baseValue: -5 },    // 1111101 -> -5
    { prefixBits: 8, prefix: 0b11111100, tableBits: 0, baseValue: 6 },    // 11111100 -> 6
    { prefixBits: 8, prefix: 0b11111101, tableBits: 0, baseValue: -6 },   // 11111101 -> -6
    { prefixBits: 9, prefix: 0b111111100, tableBits: 0, baseValue: 7 },   // 111111100 -> 7
    { prefixBits: 9, prefix: 0b111111101, tableBits: 0, baseValue: -7 },  // 111111101 -> -7
    { prefixBits: 10, prefix: 0b1111111100, tableBits: 0, baseValue: 8 }, // 1111111100 -> 8
    { prefixBits: 10, prefix: 0b1111111101, tableBits: 0, baseValue: -8 },// 1111111101 -> -8
    // Extended values use additional bits
    { prefixBits: 10, prefix: 0b1111111110, tableBits: 8, baseValue: 9 }, // prefix + 8 bits for 9-264
    { prefixBits: 10, prefix: 0b1111111111, tableBits: 16, baseValue: 0 },// prefix + 16 bits for full range
  ],
};

/**
 * Bit reader for Huffman decoding
 */
class BitReader {
  private data: Uint8Array;
  private bitPosition: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /**
   * Read specified number of bits
   */
  readBits(numBits: number): number {
    let result = 0;

    for (let i = 0; i < numBits; i++) {
      const byteIndex = Math.floor(this.bitPosition / 8);
      const bitOffset = 7 - (this.bitPosition % 8); // MSB first

      if (byteIndex >= this.data.length) {
        return -1;
      }

      const bit = (this.data[byteIndex] >> bitOffset) & 1;
      result = (result << 1) | bit;
      this.bitPosition++;
    }

    return result;
  }

  /**
   * Peek at the next bits without advancing
   */
  peekBits(numBits: number): number {
    const savedPosition = this.bitPosition;
    const result = this.readBits(numBits);
    this.bitPosition = savedPosition;
    return result;
  }

  /**
   * Check if more data is available
   */
  hasMore(): boolean {
    return Math.floor(this.bitPosition / 8) < this.data.length;
  }

  /**
   * Get remaining bits count
   */
  remainingBits(): number {
    return this.data.length * 8 - this.bitPosition;
  }
}

/**
 * Decode Huffman-encoded data using SCP tables
 */
export function decodeHuffmanSCP(
  data: Uint8Array,
  numSamples: number,
  table: HuffmanTable = SCP_DEFAULT_TABLE
): Int16Array {
  const reader = new BitReader(data);
  const output = new Int16Array(numSamples);
  let outputIndex = 0;

  // Sort entries by prefix length for efficient matching
  const sortedEntries = [...table.entries].sort((a, b) => a.prefixBits - b.prefixBits);

  while (outputIndex < numSamples && reader.hasMore()) {
    let matched = false;

    for (const entry of sortedEntries) {
      if (reader.remainingBits() < entry.prefixBits) {
        continue;
      }

      const prefix = reader.peekBits(entry.prefixBits);

      if (prefix === entry.prefix) {
        // Match found
        reader.readBits(entry.prefixBits); // Consume prefix

        let value = entry.baseValue;

        if (entry.tableBits > 0) {
          // Read additional bits for extended values
          const extra = reader.readBits(entry.tableBits);
          if (extra === -1) break;

          if (entry.tableBits === 16) {
            // Full 16-bit value (signed)
            value = extra > 32767 ? extra - 65536 : extra;
          } else {
            // Extended range
            value = entry.baseValue + extra;
          }
        }

        output[outputIndex++] = value;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // No match found, skip a bit and try again
      reader.readBits(1);
    }
  }

  return output;
}

/**
 * Parse custom Huffman table from SCP Section 2
 */
export function parseHuffmanTable(data: Uint8Array): HuffmanTable {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entries: HuffmanEntry[] = [];

  let offset = 0;

  // Read number of code structures
  const numCodes = view.getUint16(offset, true);
  offset += 2;

  for (let i = 0; i < numCodes && offset < data.length - 4; i++) {
    // Each entry: prefix bits (1 byte), table bits (1 byte), prefix (4 bytes), base value (4 bytes)
    const prefixBits = data[offset++];
    const tableBits = data[offset++];
    const prefix = view.getUint32(offset, true);
    offset += 4;
    const baseValue = view.getInt32(offset, true);
    offset += 4;

    entries.push({ prefixBits, tableBits, prefix, baseValue });
  }

  return { entries };
}

/**
 * Reverse second-difference encoding
 * SCP-ECG uses second difference to reduce entropy before Huffman encoding
 */
export function reverseSecondDifference(samples: Int16Array): Int16Array {
  const result = new Int16Array(samples.length);

  if (samples.length === 0) return result;

  // First sample is stored directly
  result[0] = samples[0];

  if (samples.length === 1) return result;

  // Second sample is first difference from first
  result[1] = samples[1] + result[0];

  // Remaining samples are second differences
  // Original: d[n] = x[n] - 2*x[n-1] + x[n-2]
  // Reverse:  x[n] = d[n] + 2*x[n-1] - x[n-2]
  for (let i = 2; i < samples.length; i++) {
    result[i] = samples[i] + 2 * result[i - 1] - result[i - 2];
  }

  return result;
}

/**
 * Add reference beat to rhythm data
 * SCP-ECG may store a reference beat separately and subtract it from rhythm
 */
export function addReferenceBeat(
  rhythmData: Int16Array,
  referenceBeat: Int16Array,
  beatLocations: number[]
): Int16Array {
  const result = new Int16Array(rhythmData);
  const beatLength = referenceBeat.length;

  for (const beatStart of beatLocations) {
    for (let i = 0; i < beatLength && beatStart + i < result.length; i++) {
      result[beatStart + i] += referenceBeat[i];
    }
  }

  return result;
}
