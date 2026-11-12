import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestError } from '../http-errors';

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));

const { createPinnedLookup, isPrivateIp, parseHttpUrl, resolvePinnedAddress } = await import('../url-fetch');

describe('url-fetch', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  describe('parseHttpUrl', () => {
    it('accepts a plain https URL', () => {
      expect(parseHttpUrl('https://example.com/page').toString()).toBe('https://example.com/page');
    });

    it('accepts a plain http URL', () => {
      expect(parseHttpUrl('http://example.com').protocol).toBe('http:');
    });

    it('rejects a non-http(s) protocol', () => {
      expect(() => parseHttpUrl('ftp://example.com/file')).toThrow(BadRequestError);
      expect(() => parseHttpUrl('file:///etc/passwd')).toThrow(BadRequestError);
      expect(() => parseHttpUrl('gopher://example.com')).toThrow(BadRequestError);
    });

    it('rejects a URL carrying embedded credentials', () => {
      expect(() => parseHttpUrl('https://user:pass@example.com')).toThrow(BadRequestError);
    });

    it('rejects a malformed URL', () => {
      expect(() => parseHttpUrl('not a url at all')).toThrow(BadRequestError);
    });
  });

  describe('isPrivateIp — the boundary the whole SSRF defense rests on', () => {
    it.each([
      ['loopback', '127.0.0.1'],
      ['loopback range', '127.255.255.254'],
      ['unspecified', '0.0.0.0'],
      ['RFC1918 10/8', '10.1.2.3'],
      ['RFC1918 172.16/12', '172.20.5.5'],
      ['RFC1918 192.168/16', '192.168.1.1'],
      ['link-local / cloud metadata', '169.254.169.254'],
      ['CGNAT 100.64/10', '100.64.0.1'],
      ['IPv6 loopback', '::1'],
      ['IPv6 unique-local fc00::/7 (fc)', 'fc00::1'],
      ['IPv6 unique-local fc00::/7 (fd)', 'fd12:3456::1'],
      ['IPv6 link-local', 'fe80::1'],
      ['IPv4-mapped IPv6 private', '::ffff:10.0.0.1'],
    ])('flags %s (%s) as private', (_label, ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });

    it.each([
      ['a real public IPv4', '93.184.216.34'],
      ['Google public DNS', '8.8.8.8'],
      ['a real public IPv6', '2606:4700:4700::1111'],
      ['IPv4-mapped IPv6 public', '::ffff:93.184.216.34'],
    ])('does not flag %s (%s) as private', (_label, ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    });
  });

  describe('resolvePinnedAddress', () => {
    it('never hits DNS for localhost-family hostnames and rejects them outright', async () => {
      await expect(resolvePinnedAddress('localhost')).rejects.toThrow(BadRequestError);
      await expect(resolvePinnedAddress('printer.local')).rejects.toThrow(BadRequestError);
      await expect(resolvePinnedAddress('0.0.0.0')).rejects.toThrow(BadRequestError);
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('accepts a literal public IP without calling DNS', async () => {
      const result = await resolvePinnedAddress('93.184.216.34');
      expect(result).toEqual({ address: '93.184.216.34', family: 4 });
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('rejects a literal private IP outright', async () => {
      await expect(resolvePinnedAddress('169.254.169.254')).rejects.toThrow(BadRequestError);
    });

    it('resolves a public hostname and PINS to the exact validated address (the fix under test)', async () => {
      lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
      const result = await resolvePinnedAddress('example.com');
      // This is the property the whole DNS-rebinding fix depends on: the
      // caller gets back the SAME address that was just validated, to
      // connect to directly — not merely a yes/no "it's fine, go resolve
      // it again yourself" the way the pre-fix `assertPublicHostname`
      // worked (which is exactly what made rebinding possible).
      expect(result).toEqual({ address: '93.184.216.34', family: 4 });
    });

    it('rejects when the resolved address is private, even if other addresses in the same answer are public', async () => {
      lookupMock.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ]);
      await expect(resolvePinnedAddress('attacker-controlled.example')).rejects.toThrow(BadRequestError);
    });

    it('rejects when DNS resolution fails', async () => {
      lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
      await expect(resolvePinnedAddress('does-not-exist.example')).rejects.toThrow(BadRequestError);
    });

    it('rejects when DNS resolution returns no addresses', async () => {
      lookupMock.mockResolvedValue([]);
      await expect(resolvePinnedAddress('no-records.example')).rejects.toThrow(BadRequestError);
    });
  });

  describe('createPinnedLookup', () => {
    // Regression coverage for a real bug hit while building this fix: Node's
    // default "Happy Eyeballs" connection algorithm (net/tls, Node 18+)
    // calls the custom `lookup` with `{ all: true }` and expects an ARRAY
    // back, not the single `(address, family)` triple `dns.lookup` normally
    // uses — answering the wrong shape doesn't throw where you'd notice;
    // it surfaces several stack frames later inside `node:net` as
    // `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined`.
    const pinned = { address: '93.184.216.34', family: 4 };

    it('answers the single-address shape: callback(err, address, family)', () => {
      const lookupFn = createPinnedLookup(pinned);
      const callback = vi.fn();
      lookupFn('whatever-hostname.example', callback);
      expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    });

    it('answers the (hostname, options, callback) shape the same way when options.all is not set', () => {
      const lookupFn = createPinnedLookup(pinned);
      const callback = vi.fn();
      lookupFn('whatever-hostname.example', {}, callback);
      expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    });

    it('answers the Happy-Eyeballs { all: true } shape with an array — the exact case that broke once', () => {
      const lookupFn = createPinnedLookup(pinned);
      const callback = vi.fn();
      lookupFn('whatever-hostname.example', { all: true }, callback);
      expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    });

    it('ignores the hostname it is asked to resolve and always answers with the pinned address', () => {
      const lookupFn = createPinnedLookup(pinned);
      const callback = vi.fn();
      lookupFn('attacker-controlled-hostname.example', { all: true }, callback);
      expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
    });
  });
});
