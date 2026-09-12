import { BadRequestException } from '@nestjs/common';
import { validateUploadedFile } from './upload-validation';

describe('validateUploadedFile', () => {
  const allowed = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  const makeFile = (mimetype: string, buffer: Buffer): Express.Multer.File =>
    ({ mimetype, buffer }) as Express.Multer.File;

  it('accepts a genuine PDF (real magic bytes + matching declared type)', () => {
    const buffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n', 'latin1'),
      Buffer.from('rest of a fake but signature-correct pdf'),
    ]);
    expect(() =>
      validateUploadedFile(makeFile('application/pdf', buffer), allowed),
    ).not.toThrow();
  });

  it('accepts a genuine JPEG', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(() =>
      validateUploadedFile(makeFile('image/jpeg', buffer), allowed),
    ).not.toThrow();
  });

  it('accepts a genuine PNG', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(() =>
      validateUploadedFile(makeFile('image/png', buffer), allowed),
    ).not.toThrow();
  });

  it('rejects a MIME type not on the allowlist, before even checking bytes', () => {
    const buffer = Buffer.from('MZ\x90\x00'); // a real Windows PE/EXE signature
    expect(() =>
      validateUploadedFile(
        makeFile('application/x-msdownload', buffer),
        allowed,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a spoofed Content-Type: claims PDF but the bytes are an executable', () => {
    const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00');
    expect(() =>
      validateUploadedFile(makeFile('application/pdf', exeBuffer), allowed),
    ).toThrow(BadRequestException);
  });

  it('rejects a spoofed extension: a .pdf-named file whose content is actually HTML/script', () => {
    const htmlBuffer = Buffer.from('<html><script>alert(1)</script></html>');
    expect(() =>
      validateUploadedFile(makeFile('application/pdf', htmlBuffer), allowed),
    ).toThrow(BadRequestException);
  });

  it('rejects an empty/truncated file that cannot possibly match any signature', () => {
    expect(() =>
      validateUploadedFile(
        makeFile('application/pdf', Buffer.alloc(0)),
        allowed,
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts a DOCX (zip-signature) file declared as the OOXML word-processing type', () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(() =>
      validateUploadedFile(
        makeFile(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer,
        ),
        allowed,
      ),
    ).not.toThrow();
  });

  it('never permits a file type not present in the signature table at all, even if somehow allowlisted', () => {
    const buffer = Buffer.from('whatever bytes');
    expect(() =>
      validateUploadedFile(makeFile('application/octet-stream', buffer), [
        ...allowed,
        'application/octet-stream',
      ]),
    ).toThrow(BadRequestException);
  });
});
