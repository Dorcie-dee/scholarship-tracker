import { Module } from '@nestjs/common';
import { UrlFetchService } from './url-fetch.service';

@Module({
  providers: [UrlFetchService],
  exports: [UrlFetchService],
})
export class UrlFetchModule {}
