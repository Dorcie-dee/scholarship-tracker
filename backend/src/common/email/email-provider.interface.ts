export interface EmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The boundary EmailService delegates to. Nothing above this interface
 * (EmailVerificationService, PasswordResetService, AuthService) knows or
 * cares which concrete provider is in use — see email.service.ts.
 */
export interface EmailProvider {
  send(params: EmailParams): Promise<void>;
}
