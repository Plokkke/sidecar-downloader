import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';

import { incomingHeader } from '@/decorators/IncomingHeader';
import { MATCHING_HEADERS_KEY, MatchingHeaderOption } from '@/decorators/MatchingHeaders';

@Injectable()
export class MatchingHeadersGuard implements CanActivate {
  private readonly logger = new Logger(MatchingHeadersGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  private getMatchingHeaderContexts(context: ExecutionContext): MatchingHeaderOption[] {
    return this.reflector.get<MatchingHeaderOption[]>(MATCHING_HEADERS_KEY, context.getHandler()) || [];
  }

  private getConfigValue(configPath: string): string {
    const expectedValue = this.configService.get<string>(configPath);
    if (!expectedValue) {
      throw new InternalServerErrorException(`Missing config path ${configPath}.`);
    }
    return expectedValue;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    this.logger.debug(`Checking headers ${JSON.stringify(request.headers)}`);

    for (const ctxt of this.getMatchingHeaderContexts(context)) {
      const value = 'value' in ctxt ? ctxt.value : this.getConfigValue(ctxt.configPath);

      try {
        incomingHeader(request.headers, {
          key: ctxt.headerKey,
          schema: z.literal(value),
        });
        this.logger.debug(`Checking header: ${ctxt.headerKey} succeeded.`);
      } catch (error) {
        this.logger.error(`Invalid or missing header: ${ctxt.headerKey}.`, error);
        throw new UnauthorizedException(`Invalid or missing header: ${ctxt.headerKey}.`);
      }
    }

    return true;
  }
}
