import { SmtpEmailProvider } from './smtp-email.provider';

/**
 * SmtpEmailProvider takes an already-constructed transporter (see the
 * class's doc comment) specifically so it can be unit-tested with a fake
 * one — no real network call, no nodemailer module mocking required.
 */
describe('SmtpEmailProvider', () => {
  const params = {
    to: 'person@example.invalid',
    subject: 'Subject',
    text: 'Body text',
    html: '<p>Body text</p>',
  };

  it('calls the transporter with the correct envelope', async () => {
    const sendMail = jest.fn(async () => ({ messageId: 'abc' }));
    const provider = new SmtpEmailProvider(
      { sendMail },
      '"Scholarship OS" <no-reply@scholarship-os.local>',
    );

    await provider.send(params);

    expect(sendMail).toHaveBeenCalledWith({
      from: '"Scholarship OS" <no-reply@scholarship-os.local>',
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  });

  it('wraps a provider failure in a safe, generic error — never the raw provider error', async () => {
    const providerError = new Error(
      '535 Authentication failed: bad credentials for smtp-relay.internal',
    );
    const sendMail = jest.fn(async () => {
      throw providerError;
    });
    const provider = new SmtpEmailProvider(
      { sendMail },
      'from@example.invalid',
    );

    await expect(provider.send(params)).rejects.toThrow('Failed to send email');
    // The raw provider error (which could carry credential/hostname details)
    // must not propagate as-is.
    await expect(provider.send(params)).rejects.not.toThrow(
      providerError.message,
    );
  });

  it('never includes the message body/token in the thrown error', async () => {
    const sensitiveParams = {
      ...params,
      text: 'Your verification code is 482913',
    };
    const sendMail = jest.fn(async () => {
      throw new Error('connection timeout');
    });
    const provider = new SmtpEmailProvider(
      { sendMail },
      'from@example.invalid',
    );

    await expect(provider.send(sensitiveParams)).rejects.not.toThrow(/482913/);
  });
});
