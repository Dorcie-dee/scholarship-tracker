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
/**
 * `unsafe-eval` is added to `script-src` in development ONLY — React's dev
 * tooling (better error stack traces, Fast Refresh) calls `eval()`
 * internally; production React never does. Loosening this in production
 * would defeat the point of having the CSP, so it must stay dev-only.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''}`,
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
  // This folder is its own project, not part of a workspace — pinned
  // explicitly because Turbopack otherwise infers the root by walking up
  // for the nearest lockfile, and picks the wrong directory if a stray
  // lockfile (e.g. from an accidental `yarn install` one level up, in the
  // parent folder that also holds the separate backend/ project) ever
  // exists above this one.
  turbopack: {
    root: import.meta.dirname,
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
