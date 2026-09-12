import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Liveness — process is up. No external dependency check; safe to poll frequently. */
  @Public()
  @Get('health')
  getHealth() {
    return this.appService.getLiveness();
  }

  /** Readiness — this instance can actually serve traffic (real DB connectivity check). */
  @Public()
  @Get('health/ready')
  getReadiness() {
    return this.appService.getReadiness();
  }
}
