import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
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

/**
 * SSRF-aware HTTP fetch for OpportunitySource capture — ported from the
 * NestJS backend's `common/http/url-fetch.service.ts`. Resolves DNS, rejects
 * private/link-local/metadata addresses, follows a bounded number of
 * redirects with the same checks, and returns a plain-text excerpt — never a
 * full page archive.
 */
export async function fetchUrlPreview(rawUrl: string): Promise<FetchedUrlPreview> {
  const { timeoutMs, maxResponseBytes, maxRedirects } = getConfig().urlFetch;

  const initial = parseHttpUrl(rawUrl);
  await assertPublicHostname(initial.hostname);

  let current = initial;
  let response: Response | null = null;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Schola-SourceFetcher/1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RequestTimeoutError(
          'Timed out while fetching that URL. Try again or paste an excerpt manually.',
        );
      }
      throw new ServiceUnavailableError(
        'Could not reach that URL. Check the link or paste an excerpt manually.',
      );
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === maxRedirects) {
        throw new BadRequestError('That URL redirected too many times. Paste an excerpt manually instead.');
      }
      const location = response.headers.get('location');
      if (!location) {
        throw new BadRequestError('The URL redirected without a destination.');
      }
      const next = parseHttpUrl(new URL(location, current).toString());
      await assertPublicHostname(next.hostname);
      current = next;
      continue;
    }

    break;
  }

  if (!response) {
    throw new ServiceUnavailableError('Could not fetch that URL.');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new BadRequestError(`That URL returned status ${response.status}. Paste an excerpt manually instead.`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && !/text\/|application\/(xhtml\+xml|xml|json)/i.test(contentType)) {
    throw new BadRequestError('That URL does not look like a readable page. Paste an excerpt manually instead.');
  }

  const buffer = await readLimitedBody(response, maxResponseBytes);
  const charsetMatch = contentType?.match(/charset=([^\s;]+)/i);
  const encoding = charsetMatch?.[1] || 'utf-8';
  let html: string;
  try {
    html = new TextDecoder(encoding).decode(buffer);
  } catch {
    html = new TextDecoder('utf-8').decode(buffer);
  }

  const title = extractTitle(html);
  const extractedContent = htmlToExcerpt(html);

  if (!extractedContent) {
    throw new BadRequestError('No readable text was found on that page. Paste an excerpt manually instead.');
  }

  return { url: initial.toString(), finalUrl: current.toString(), title, extractedContent, contentType };
}

function parseHttpUrl(raw: string): URL {
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

async function assertPublicHostname(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '0.0.0.0') {
    throw new BadRequestError('That host is not allowed.');
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new BadRequestError('That host is not allowed.');
    }
    return;
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
}

function isPrivateIp(ip: string): boolean {
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

async function readLimitedBody(response: Response, maxResponseBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      throw new BadRequestError('That page is too large to fetch automatically. Paste an excerpt manually instead.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
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
