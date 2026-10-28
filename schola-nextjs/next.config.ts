import type { NextConfig } from 'next';

/**
 * Security headers were entirely absent before this (Next.js sets none by
 * default). A nonce-based CSP (strict `script-src`, no `unsafe-inline`)
 * would be stronger, but it requires `middleware.ts` plus verifying real
 * browser hydration isn't broken — not something confirmable from a
 * terminal alone. This set is deliberately the safely-verifiable option:
 * still blocks framing, MIME-sniffing, cross-origin leakage, and restricts
 * every fetch/connect/image/font origin to this app's own (plus Cloudinary,
 * the only third-party origin the app actually talks to — document
 * downloads). Tightening `script-src`/`style-src` to a nonce is a good
 * follow-up once there's a way to validate it against the real rendered app.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://res.cloudinary.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Browsers only honor this over an actual HTTPS connection, so it's a
  // harmless no-op in local HTTP development.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['mongoose', 'mongodb-memory-server'],
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
