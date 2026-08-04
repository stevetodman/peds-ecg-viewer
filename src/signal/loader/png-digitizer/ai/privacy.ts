/**
 * Guardrails for sending ECG images to an external AI service.
 *
 * An ECG image can contain PHI.  Authorization is deliberately supplied to
 * each request instead of being retained on a provider instance so that a
 * caller must make an explicit decision for every transmission.
 */

export type ExternalAIProvider = 'anthropic' | 'openai' | 'google' | 'xai';

export const AI_PROVIDER_DESTINATIONS: Record<ExternalAIProvider, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  xai: 'https://api.x.ai/v1',
};

/**
 * Required acknowledgement before one ECG image is transmitted externally.
 * `destination` is intentionally an exact API base URL, not a display name.
 */
export interface AITransmissionAuthorization {
  provider: ExternalAIProvider;
  destination: string;
  /** The caller has completed its PHI/privacy review for this transmission. */
  phiReviewAttested: true;
}

/** A multi-provider operation must acknowledge every possible destination. */
export type AITransmissionAuthorizationRequest =
  | AITransmissionAuthorization
  | readonly AITransmissionAuthorization[];

export class AITransmissionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AITransmissionBlockedError';
  }
}

/** Fail closed before image conversion or any call to `fetch`. */
export function assertAITransmissionAuthorized(
  provider: ExternalAIProvider,
  authorization: AITransmissionAuthorizationRequest | undefined,
): void {
  if (typeof window !== 'undefined') {
    throw new AITransmissionBlockedError(
      'Browser-side AI API calls are disabled. Send requests through a server-side, approved integration.',
    );
  }

  const destination = AI_PROVIDER_DESTINATIONS[provider];
  const request = Array.isArray(authorization)
    ? authorization.find((entry) => entry.provider === provider)
    : authorization;
  if (!request) {
    throw new AITransmissionBlockedError(
      `External AI transmission to ${destination} is blocked: explicit per-request authorization is required.`,
    );
  }
  if (request.provider !== provider) {
    throw new AITransmissionBlockedError(
      `External AI transmission is blocked: authorization is for ${request.provider}, not ${provider}.`,
    );
  }
  if (request.destination !== destination) {
    throw new AITransmissionBlockedError(
      `External AI transmission is blocked: destination must be exactly ${destination}.`,
    );
  }
  if (request.phiReviewAttested !== true) {
    throw new AITransmissionBlockedError(
      'External AI transmission is blocked: PHI review attestation is required.',
    );
  }
}
