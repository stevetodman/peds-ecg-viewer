import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseAIProvider } from '../../../src/signal/loader/png-digitizer/ai/provider';
import {
  AI_PROVIDER_DESTINATIONS,
  AITransmissionBlockedError,
  type AITransmissionAuthorization,
} from '../../../src/signal/loader/png-digitizer/ai/privacy';

class FetchingTestProvider extends BaseAIProvider {
  name = 'openai';
  readonly privacyProvider = 'openai' as const;

  protected async callAPI(): Promise<string> {
    await fetch('https://example.test/ai');
    return '{}';
  }
}

const authorization: AITransmissionAuthorization = {
  provider: 'openai',
  destination: AI_PROVIDER_DESTINATIONS.openai,
  phiReviewAttested: true,
};

describe('external AI privacy guard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not call fetch when authorization is absent', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new FetchingTestProvider('test-key');

    await expect(provider.analyze('a'.repeat(64))).rejects.toBeInstanceOf(
      AITransmissionBlockedError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires the reviewed provider and exact destination', async () => {
    const provider = new FetchingTestProvider('test-key');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(provider.analyze('a'.repeat(64), {
      ...authorization,
      destination: 'https://unapproved.example',
    })).rejects.toBeInstanceOf(AITransmissionBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks browser execution before a direct API-key call', async () => {
    const provider = new FetchingTestProvider('test-key');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', {});

    await expect(provider.analyze('a'.repeat(64), authorization)).rejects.toBeInstanceOf(
      AITransmissionBlockedError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
