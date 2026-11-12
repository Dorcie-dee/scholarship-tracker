import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { getConfig } from './config';
import { EXCERPT_MAX_LENGTH } from './text-limits';
import {
  BadRequestError,
  HttpError,
  ServiceUnavailableError,
} from './http-errors';

export interface FetchedUrlPreview {
  url: string;
  finalUrl: string;
  title: string | null;
  extractedContent: string;
  contentType: string | null;
}

class RequestTimeoutError extends HttpError {
  constructor(message: string) {
    super(408, message, 'Request Timeout');
  }
}

export interface PinnedAddress {
  address: string;
  family: number;
}

interface PinnedResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

/**
 * SSRF-aware HTTP fetch for OpportunitySource capture — ported from the
 * NestJS backend's `common/http/url-fetch.service.ts`. Resolves DNS, rejects
 * private/link-local/metadata addresses, follows a bounded number of
 * redirects with the same checks, and returns a plain-text excerpt — never a
 * full page archive.
 *
 * **DNS-rebinding hardening**: the obvious way to write this — resolve the
 * hostname to check it's public, then call `fetch(url)` — has a TOCTOU gap.
 * `fetch()` re-resolves the hostname itself when it actually connects, as a
 * completely separate DNS query; an attacker who controls the authoritative
 * nameserver for their own domain can answer the validation query with a
 * public IP and the connection query with `169.254.169.254` (cloud instance
 * metadata) or any internal address, with TTL=0 so nothing caches the first
 * answer. This function closes that gap by resolving once
 * (`resolvePinnedAddress`), validating that result, and then connecting
 * `node:http`/`node:https` directly to that exact IP via a custom `lookup`
 * override — the hostname is still sent as the `Host` header / TLS SNI (so
 * virtual hosting and certificate validation both still work correctly),
 * but the TCP connection itself can never land anywhere other than the
 * address that was actually checked. Every redirect hop repeats the full
 * resolve-then-pin sequence against its own target.
 */
export async function fetchUrlPreview(rawUrl: string): Promise<FetchedUrlPreview> {
  const { timeoutMs, maxResponseBytes, maxRedirects } = getConfig().urlFetch;

  const initial = parseHttpUrl(rawUrl);
  let pinned = await resolvePinnedAddress(initial.hostname);

  let current = initial;
  let response: PinnedResponse | null = null;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    response = await pinnedRequest(current, pinned, { timeoutMs, maxResponseBytes });

    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (hop === maxRedirects) {
        throw new BadRequestError('That URL redirected too many times. Paste an excerpt manually instead.');
      }
      const location = firstHeaderValue(response.headers.location);
      if (!location) {
        throw new BadRequestError('The URL redirected without a destination.');
      }
      const next = parseHttpUrl(new URL(location, current).toString());
      pinned = await resolvePinnedAddress(next.hostname);
      current = next;
      continue;
    }

    break;
  }

  if (!response) {
    throw new ServiceUnavailableError('Could not fetch that URL.');
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new BadRequestError(`That URL returned status ${response.statusCode}. Paste an excerpt manually instead.`);
  }

  const contentType = firstHeaderValue(response.headers['content-type']);
  if (contentType && !/text\/|application\/(xhtml\+xml|xml|json)/i.test(contentType)) {
    throw new BadRequestError('That URL does not look like a readable page. Paste an excerpt manually instead.');
  }

  const charsetMatch = contentType?.match(/charset=([^\s;]+)/i);
  const encoding = charsetMatch?.[1] || 'utf-8';
  let html: string;
  try {
    html = new TextDecoder(encoding).decode(response.body);
  } catch {
    html = new TextDecoder('utf-8').decode(response.body);
  }

  const title = extractTitle(html);
  const extractedContent = htmlToExcerpt(html);

  if (!extractedContent) {
    throw new BadRequestError('No readable text was found on that page. Paste an excerpt manually instead.');
  }

  return { url: initial.toString(), finalUrl: current.toString(), title, extractedContent, contentType: contentType ?? null };
}

export function parseHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new BadRequestError('Enter a valid http(s) URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError('Only http and https URLs are allowed.');
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestError('URLs with credentials are not allowed.');
  }
  return parsed;
}

/**
 * Validates the hostname is public AND returns the exact address to connect
 * to — the one piece of state that makes the pinning in `pinnedRequest()`
 * possible. Never discard this result and re-resolve later; that would
 * reopen the exact TOCTOU gap this module exists to close.
 */
export async function resolvePinnedAddress(hostname: string): Promise<PinnedAddress> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0') {
    throw new BadRequestError('That host is not allowed.');
  }

  const literalFamily = isIP(host);
  if (literalFamily) {
    if (isPrivateIp(host)) {
      throw new BadRequestError('That host is not allowed.');
    }
    return { address: host, family: literalFamily };
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BadRequestError('Could not resolve that hostname.');
  }
  if (addresses.length === 0) {
    throw new BadRequestError('Could not resolve that hostname.');
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new BadRequestError('That host resolves to a private address.');
    }
  }
  return addresses[0];
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80')) return true;
    if (normalized.startsWith('::ffff:')) {
      return isPrivateIp(normalized.slice('::ffff:'.length));
    }
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type LookupOneCallback = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;
type LookupAllCallback = (err: NodeJS.ErrnoException | null, addresses: { address: string; family: number }[]) => void;

/**
 * A `dns.lookup`-compatible function that ignores whatever hostname it's
 * asked to resolve and always answers with the one pre-validated address —
 * this is what actually pins the TCP connection in `pinnedRequest()` below.
 *
 * Node calls this with either `(hostname, options, callback)` or
 * `(hostname, callback)`, AND — this is the part that isn't obvious from
 * the docs and broke the first version of this function — modern Node
 * (its default "Happy Eyeballs" multi-address connection algorithm, used
 * by `net`/`tls` since Node 18+) calls it with `options.all === true` and
 * expects the callback invoked with an ARRAY of `{address, family}`
 * objects, not the single `(err, address, family)` triple `dns.lookup`
 * normally uses. Answering the wrong shape doesn't error loudly — it
 * surfaces several frames later as a confusing `ERR_INVALID_IP_ADDRESS:
 * Invalid IP address: undefined` deep inside `node:net`. Both shapes are
 * handled here, always resolving to the one pinned address either way.
 */
export function createPinnedLookup(pinned: PinnedAddress) {
  return (
    _hostname: string,
    optionsOrCallback: { all?: boolean } | LookupOneCallback | LookupAllCallback,
    maybeCallback?: LookupOneCallback | LookupAllCallback,
  ): void => {
    const wantsAll = typeof optionsOrCallback === 'object' && optionsOrCallback !== null && optionsOrCallback.all === true;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (!callback) return;
    if (wantsAll) {
      (callback as LookupAllCallback)(null, [{ address: pinned.address, family: pinned.family }]);
    } else {
      (callback as LookupOneCallback)(null, pinned.address, pinned.family);
    }
  };
}

function pinnedRequest(
  url: URL,
  pinned: PinnedAddress,
  options: { timeoutMs: number; maxResponseBytes: number },
): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;
    let settled = false;

    const req = requestFn(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        // The one line that matters: connects to the pre-validated IP,
        // never re-resolving `url.hostname` itself.
        lookup: createPinnedLookup(pinned) as never,
        headers: {
          'User-Agent': 'Schola-SourceFetcher/1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        },
        timeout: options.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;

        res.on('data', (chunk: Buffer) => {
          if (settled) return;
          total += chunk.length;
          if (total > options.maxResponseBytes) {
            settled = true;
            res.destroy();
            reject(new BadRequestError('That page is too large to fetch automatically. Paste an excerpt manually instead.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        res.on('error', (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new RequestTimeoutError('Timed out while fetching that URL. Try again or paste an excerpt manually.'));
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(
        err instanceof RequestTimeoutError
          ? err
          : new ServiceUnavailableError('Could not reach that URL. Check the link or paste an excerpt manually.'),
      );
    });
    req.end();
  });
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, ' ').trim();
  return title.slice(0, 255) || null;
}

function htmlToExcerpt(html: string): string {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const text = decodeEntities(
    withoutNoise.replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br|section|article)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return text.slice(0, EXCERPT_MAX_LENGTH);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}
