import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from '@/modules/health/health.controller';
import { HealthService } from '@/modules/health/health.service';

@Module({
  controllers: [HealthController],
  imports: [TerminusModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
