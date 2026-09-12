import { IsUrl, MaxLength } from 'class-validator';

export class FetchUrlPreviewDto {
  @IsUrl({ require_protocol: true }, { message: 'Enter a valid http(s) URL' })
  @MaxLength(1024)
  url: string;
}
