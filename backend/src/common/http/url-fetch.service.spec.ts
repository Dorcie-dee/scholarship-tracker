import { BadRequestException } from '@nestjs/common';
import { UrlFetchService } from './url-fetch.service';

describe('UrlFetchService — SSRF and validation', () => {
  let service: UrlFetchService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new UrlFetchService({
      get: () => ({
        timeoutMs: 1000,
        maxResponseBytes: 10_000,
        maxRedirects: 2,
      }),
    } as any);
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects non-http schemes', async () => {
    await expect(service.fetchPreview('file:///etc/passwd')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects localhost', async () => {
    await expect(
      service.fetchPreview('http://localhost/secret'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects private IPv4 literals', async () => {
    await expect(service.fetchPreview('http://127.0.0.1/')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.fetchPreview('http://10.0.0.5/')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.fetchPreview('http://192.168.1.1/')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.fetchPreview('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects private IPv6 literals', async () => {
    await expect(service.fetchPreview('http://[::1]/')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.fetchPreview('http://[fc00::1]/')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.fetchPreview('http://[fe80::1]/')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(
      service.fetchPreview('https://user:pass@example.com/'),
    ).rejects.toThrow(BadRequestException);
  });

  it('extracts title and text from a public HTML response', async () => {
    // Public IP literal — skips DNS; fetch is fully mocked.
    fetchMock.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'text/html; charset=utf-8' : null,
      },
      body: {
        getReader: () => {
          const html = new TextEncoder().encode(
            '<html><head><title>Grant Page</title></head><body><p>Hello scholarship</p></body></html>',
          );
          let done = false;
          return {
            read: async () => {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: html };
            },
            cancel: async () => undefined,
          };
        },
      },
    });

    const result = await service.fetchPreview('http://8.8.8.8/page');
    expect(result.title).toBe('Grant Page');
    expect(result.extractedContent).toContain('Hello scholarship');
  });

  it('rejects redirect to a private host', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 302,
      headers: {
        get: (name: string) =>
          name === 'location' ? 'http://127.0.0.1/admin' : null,
      },
      body: null,
    });

    await expect(service.fetchPreview('http://8.8.8.8/start')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects oversized responses', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/html' : null),
      },
      body: {
        getReader: () => {
          let calls = 0;
          return {
            read: async () => {
              calls += 1;
              if (calls > 2) return { done: true, value: undefined };
              return {
                done: false,
                value: new Uint8Array(6000),
              };
            },
            cancel: async () => undefined,
          };
        },
      },
    });

    await expect(service.fetchPreview('http://8.8.8.8/big')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects non-text content types', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (name: string) =>
          name === 'content-type' ? 'application/pdf' : null,
      },
      body: null,
    });

    await expect(
      service.fetchPreview('http://8.8.8.8/file.pdf'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects excessive redirects', async () => {
    fetchMock
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) =>
            name === 'location' ? 'http://8.8.8.8/a' : null,
        },
        body: null,
      })
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) =>
            name === 'location' ? 'http://8.8.8.8/b' : null,
        },
        body: null,
      })
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) =>
            name === 'location' ? 'http://8.8.8.8/c' : null,
        },
        body: null,
      });

    await expect(service.fetchPreview('http://8.8.8.8/start')).rejects.toThrow(
      BadRequestException,
    );
  });
});
