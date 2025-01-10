import { Controller, Get, HttpCode, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

import { HealthService } from '@/modules/health/health.service';

@Controller({ path: '/health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly service: HealthService,
  ) {}

  @Get('/startup')
  @HttpCode(HttpStatus.NO_CONTENT)
  @HealthCheck()
  async checkStartup(): Promise<void> {
    return;
  }

  @Get('/liveness')
  @HealthCheck()
  async checkLiveness(): Promise<HealthCheckResult> {
    return this.health.check(this.service.livenessChecks);
  }

  @Get('/readiness')
  @HealthCheck()
  async checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check(this.service.readinessChecks);
  }
}
