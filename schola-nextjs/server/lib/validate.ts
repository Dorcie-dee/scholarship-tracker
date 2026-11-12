import type { ZodSchema } from 'zod';
import { BadRequestError } from './http-errors';

/**
 * Parses the request body as JSON and validates it against `schema`.
 * Equivalent to the NestJS backend's global `ValidationPipe({ whitelist:
 * true, forbidNonWhitelisted: true })` — every DTO schema here should be a
 * zod `.strict()` object so unknown fields are rejected, not silently
 * dropped, matching the original API contract exactly.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new BadRequestError('Request body must be valid JSON');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(body)'}: ${issue.message}`)
      .join('; ');
    throw new BadRequestError(message);
  }
  return result.data;
}

export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: ZodSchema<T>,
): T {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(query)'}: ${issue.message}`)
      .join('; ');
    throw new BadRequestError(message);
  }
  return result.data;
}
