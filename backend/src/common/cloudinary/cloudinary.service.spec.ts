import { CloudinaryService } from './cloudinary.service';

/**
 * Production hardening (Batch 6) — covers the parts of CloudinaryService
 * that don't require a real network call: `isConfigured()`'s gating, and
 * `getSignedDeliveryUrl()`'s URL shape (`cloudinary.url()` is a pure,
 * client-side URL-building function once the SDK is `.config()`ured — no
 * network access needed to exercise it, only real-looking test
 * credentials). `uploadBuffer()`/`deleteByPublicId()` are integration-level
 * (real Cloudinary API calls) and are exercised via mocked usage in
 * documents.service.spec.ts instead — this file covers CloudinaryService's
 * own logic in isolation.
 */
describe('CloudinaryService', () => {
  const makeConfigService = (configured: boolean) => ({
    get: jest.fn(() => ({
      cloudName: configured ? 'test-cloud' : undefined,
      apiKey: configured ? '123456789012345' : undefined,
      apiSecret: configured ? 'test-secret-value' : undefined,
    })),
  });

  describe('when Cloudinary is not configured', () => {
    let service: CloudinaryService;

    beforeEach(() => {
      service = new CloudinaryService(makeConfigService(false) as any);
      service.onModuleInit();
    });

    it('isConfigured() reports false', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('uploadBuffer() throws a clear error rather than attempting a network call', async () => {
      await expect(
        service.uploadBuffer(Buffer.from('x'), { folder: 'test' }),
      ).rejects.toThrow('Cloudinary is not configured');
    });

    it('getSignedDeliveryUrl() throws a clear error', () => {
      expect(() => service.getSignedDeliveryUrl('public-id', 'raw')).toThrow(
        'Cloudinary is not configured',
      );
    });

    it('deleteByPublicId() resolves silently (a no-op) rather than throwing', async () => {
      await expect(
        service.deleteByPublicId('public-id', 'raw'),
      ).resolves.toBeUndefined();
    });
  });

  describe('when Cloudinary is configured', () => {
    let service: CloudinaryService;

    beforeEach(() => {
      service = new CloudinaryService(makeConfigService(true) as any);
      service.onModuleInit();
    });

    it('isConfigured() reports true', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('getSignedDeliveryUrl() produces an authenticated, signed URL — never a plain public one', () => {
      const url = service.getSignedDeliveryUrl(
        'scholarship-os/user-1/documents/cv',
        'raw',
      );

      expect(url).toContain('/authenticated/');
      // A signed URL carries a signature component distinguishing it from
      // an unsigned, guessable-from-publicId-alone URL.
      expect(url).toMatch(/s--[\w-]+--/);
    });

    it('getSignedDeliveryUrl() reflects the requested resource type in the URL path', () => {
      const imageUrl = service.getSignedDeliveryUrl('public-id', 'image');
      const rawUrl = service.getSignedDeliveryUrl('public-id', 'raw');

      expect(imageUrl).toContain('/image/');
      expect(rawUrl).toContain('/raw/');
    });

    it('two different publicIds never produce the same signed URL', () => {
      const urlA = service.getSignedDeliveryUrl('doc-a', 'raw');
      const urlB = service.getSignedDeliveryUrl('doc-b', 'raw');

      expect(urlA).not.toBe(urlB);
    });
  });
});
