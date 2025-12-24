/**
 * LZW Decompression for Philips Sierra ECG XML Format
 *
 * Implements the XLI compression scheme used in Philips ECG XML files.
 * Based on the LZW algorithm with variable-width codes (9-12 bits).
 *
 * @module signal/loader/compression/lzw
 */

/**
 * Bit reader for extracting variable-width codes from a byte stream
 */
class BitReader {
  private data: Uint8Array;
  private bitPosition: number = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  /**
   * Read a code of specified bit width
   */
  readBits(numBits: number): number {
    let result = 0;
    let bitsRead = 0;

    while (bitsRead < numBits) {
      const byteIndex = Math.floor(this.bitPosition / 8);
      const bitOffset = this.bitPosition % 8;

      if (byteIndex >= this.data.length) {
        return -1; // End of data
      }

      // How many bits can we read from this byte?
      const bitsAvailable = 8 - bitOffset;
      const bitsToRead = Math.min(numBits - bitsRead, bitsAvailable);

      // Create mask for the bits we want
      const mask = ((1 << bitsToRead) - 1) << bitOffset;
      const bits = (this.data[byteIndex] & mask) >> bitOffset;

      // Add to result
      result |= bits << bitsRead;

      bitsRead += bitsToRead;
      this.bitPosition += bitsToRead;
    }

    return result;
  }

  /**
   * Check if we've reached the end of data
   */
  hasMore(): boolean {
    return Math.floor(this.bitPosition / 8) < this.data.length;
  }

  /**
   * Get current byte position
   */
  getBytePosition(): number {
    return Math.floor(this.bitPosition / 8);
  }
}

/**
 * LZW decompressor for Philips XLI format
 */
export function decompressLZW(compressedData: Uint8Array): Uint8Array {
  const MIN_CODE_SIZE = 9;
  const MAX_CODE_SIZE = 12;
  const CLEAR_CODE = 256;
  const END_CODE = 257;
  const FIRST_CODE = 258;

  const reader = new BitReader(compressedData);
  const output: number[] = [];

  // Initialize dictionary with single-byte entries
  let dictionary: number[][] = [];
  let codeSize = MIN_CODE_SIZE;
  let nextCode = FIRST_CODE;

  // Initialize dictionary (0-255 are single bytes)
  for (let i = 0; i < 256; i++) {
    dictionary[i] = [i];
  }
  // CLEAR_CODE and END_CODE don't have entries
  dictionary[CLEAR_CODE] = [];
  dictionary[END_CODE] = [];

  let prevEntry: number[] = [];

  while (reader.hasMore()) {
    const code = reader.readBits(codeSize);
    if (code === -1 || code === END_CODE) {
      break;
    }

    if (code === CLEAR_CODE) {
      // Reset dictionary
      dictionary = [];
      for (let i = 0; i < 256; i++) {
        dictionary[i] = [i];
      }
      dictionary[CLEAR_CODE] = [];
      dictionary[END_CODE] = [];
      codeSize = MIN_CODE_SIZE;
      nextCode = FIRST_CODE;
      prevEntry = [];
      continue;
    }

    let entry: number[];

    if (code < nextCode && dictionary[code]) {
      // Code is in dictionary
      entry = dictionary[code];
    } else if (code === nextCode && prevEntry.length > 0) {
      // Special case: code not yet in dictionary
      // Entry is previous entry + first byte of previous entry
      entry = [...prevEntry, prevEntry[0]];
    } else {
      // Invalid code
      break;
    }

    // Output entry
    for (const byte of entry) {
      output.push(byte);
    }

    // Add new entry to dictionary
    if (prevEntry.length > 0 && nextCode < 4096) {
      dictionary[nextCode] = [...prevEntry, entry[0]];
      nextCode++;

      // Increase code size if needed
      if (nextCode >= (1 << codeSize) && codeSize < MAX_CODE_SIZE) {
        codeSize++;
      }
    }

    prevEntry = entry;
  }

  return new Uint8Array(output);
}

/**
 * Decode delta-encoded samples
 * Philips uses first and second difference encoding
 */
export function decodeDelta(data: Uint8Array, numChannels: number): Int16Array[] {
  // Convert bytes to Int16 samples (little-endian)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const samples: number[] = [];

  for (let i = 0; i < data.length - 1; i += 2) {
    samples.push(view.getInt16(i, true));
  }

  // Split into channels
  const samplesPerChannel = Math.floor(samples.length / numChannels);
  const channels: Int16Array[] = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = new Int16Array(samplesPerChannel);

    // Apply inverse delta encoding
    // First sample is absolute, subsequent are differences
    let prev1 = 0;

    for (let i = 0; i < samplesPerChannel; i++) {
      const idx = ch * samplesPerChannel + i;
      if (idx >= samples.length) break;

      // First difference decoding
      const delta = samples[idx];
      const value = delta + prev1;
      channelData[i] = value;

      prev1 = value;
    }

    channels.push(channelData);
  }

  return channels;
}

/**
 * Decode second-difference encoded samples
 */
export function decodeSecondDifference(samples: Int16Array): Int16Array {
  const result = new Int16Array(samples.length);

  if (samples.length === 0) return result;

  // First two samples are stored directly
  result[0] = samples[0];
  if (samples.length > 1) {
    result[1] = samples[1];
  }

  // Remaining samples are second differences
  // y[n] = x[n] + 2*y[n-1] - y[n-2]
  for (let i = 2; i < samples.length; i++) {
    result[i] = samples[i] + 2 * result[i - 1] - result[i - 2];
  }

  return result;
}

/**
 * Decompress Philips XLI format data
 *
 * The XLI format consists of:
 * - 8-byte header (first 4 bytes = compressed size)
 * - LZW compressed data
 * - Delta-encoded samples
 */
export function decompressXLI(data: Uint8Array, numChannels: number = 12): Int16Array[] {
  // Skip 8-byte header
  const compressedData = data.slice(8);

  // LZW decompress
  const decompressed = decompressLZW(compressedData);

  // Decode delta encoding
  const channels = decodeDelta(decompressed, numChannels);

  // Apply second-difference decoding to each channel
  return channels.map(ch => decodeSecondDifference(ch));
}
