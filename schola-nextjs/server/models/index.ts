/**
 * Importing this module registers every Mongoose model on the shared
 * connection. Import it (for its side effects) anywhere that calls
 * `.populate()` across model boundaries before the referenced model's own
 * file is guaranteed to have been imported yet — e.g. seed scripts and the
 * vitest setup file.
 */
export * from './user.model';
export * from './refresh-session.model';
export * from './email-verification-otp.model';
export * from './password-reset-token.model';
export * from './applicant-profile.model';
export * from './university.model';
export * from './programme.model';
export * from './opportunity.model';
export * from './opportunity-source.model';
export * from './application-journey.model';
export * from './application.model';
export * from './task.model';
export * from './deadline.model';
export * from './requirement.model';
export * from './document.model';
export * from './application-document.model';
export * from './application-snapshot.model';
export * from './rate-limit-counter.model';
