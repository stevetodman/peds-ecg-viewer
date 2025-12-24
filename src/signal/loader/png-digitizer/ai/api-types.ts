/**
 * AI API Response Type Definitions
 *
 * Type definitions for AI provider API responses to ensure type safety
 * when parsing JSON responses from Claude, OpenAI, Google Gemini, and xAI.
 *
 * @module signal/loader/png-digitizer/ai/api-types
 */

// =============================================================================
// Anthropic Claude API Types
// =============================================================================

/** Anthropic Claude API Response */
export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContent[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

/** Content block in Anthropic response */
export interface AnthropicContent {
  type: 'text';
  text: string;
}

/** Usage statistics in Anthropic response */
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

// =============================================================================
// OpenAI API Types
// =============================================================================

/** OpenAI Chat Completions API Response (GPT-4, GPT-4o, etc.) */
export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage: OpenAIUsage;
}

/** Choice in OpenAI Chat Completions response */
export interface OpenAIChatChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: string;
}

/** Message in OpenAI Chat response */
export interface OpenAIChatMessage {
  role: string;
  content: string;
}

/** Usage statistics in OpenAI response */
export interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** OpenAI Responses API Response (GPT-5.2 Pro) */
export interface OpenAIResponsesResponse {
  id: string;
  object: string;
  output: OpenAIResponseOutput[];
}

/** Output item in OpenAI Responses API */
export interface OpenAIResponseOutput {
  type: 'message';
  content: OpenAIResponseContent[];
}

/** Content in OpenAI Responses output */
export type OpenAIResponseContent =
  | { type: 'output_text'; text: string }
  | { type: string };

// =============================================================================
// Google Gemini API Types
// =============================================================================

/** Google Gemini API Response */
export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

/** Candidate in Gemini response */
export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  safetyRatings: GeminiSafetyRating[];
}

/** Content in Gemini candidate */
export interface GeminiContent {
  parts: GeminiPart[];
}

/** Part in Gemini content */
export interface GeminiPart {
  text?: string;
}

/** Safety rating in Gemini response */
export interface GeminiSafetyRating {
  category: string;
  probability: string;
}

/** Usage metadata in Gemini response */
export interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
}

// =============================================================================
// xAI/Grok API Types (OpenAI-compatible format)
// =============================================================================

/** xAI/Grok API Response */
export interface XAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: XAIChoice[];
  usage?: XAIUsage;
}

/** Choice in xAI response */
export interface XAIChoice {
  index: number;
  message: XAIMessage;
  finish_reason: string;
}

/** Message in xAI response */
export interface XAIMessage {
  role: string;
  content: string;
}

/** Usage statistics in xAI response */
export interface XAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// =============================================================================
// OCR Metadata Types
// =============================================================================

/** Raw text item in OCR results */
export interface OCRRawTextItem {
  text?: string;
  location?: string;
  confidence?: number;
}

/** Structured OCR metadata extracted from ECG images */
export interface OCRMetadataResult {
  patient?: {
    name?: string;
    id?: string;
    dob?: string;
    age?: number | string;
    sex?: string;
    dateOfBirth?: string;
  };
  acquisition?: {
    date?: string;
    time?: string;
    location?: string;
    device?: string;
    technician?: string;
    deviceSerial?: string;
  };
  measurements?: {
    heartRate?: number;
    prInterval?: number;
    qrsDuration?: number;
    qtInterval?: number;
    qtcInterval?: number;
    pAxis?: number;
    qrsAxis?: number;
    tAxis?: number;
    rrInterval?: number;
  };
  interpretation?: {
    rhythm?: string;
    findings?: string[];
    diagnosis?: string[];
    severity?: string;
  };
  settings?: {
    paperSpeed?: number;
    gain?: number;
    filter?: string;
    limb?: string;
    chest?: string;
  };
  rawText?: OCRRawTextItem[];
  confidence?: number;
}

/** Ensemble arbitration response from AI */
export interface EnsembleArbitrationResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}
