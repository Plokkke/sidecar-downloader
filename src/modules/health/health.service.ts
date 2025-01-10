import { HealthCheckError, HealthIndicatorResult } from '@nestjs/terminus';

export type HealthCheck = () => boolean | Promise<boolean>;

function checkWrapper([key, check]: [string, HealthCheck]): () => Promise<HealthIndicatorResult> {
  return async (): Promise<HealthIndicatorResult> => {
    const isHealthy = await check();
    const result: HealthIndicatorResult = { [key]: { status: isHealthy ? 'up' : 'down' } };
    if (isHealthy) {
      return result;
    }
    throw new HealthCheckError('Health check failed', result);
  };
}

export class HealthService {
  private readonly _livenessChecks: Record<string, HealthCheck> = {};
  private readonly _readinessChecks: Record<string, HealthCheck> = {};

  get livenessChecks(): (() => Promise<HealthIndicatorResult>)[] {
    return Object.entries(this._livenessChecks).map(checkWrapper);
  }

  get readinessChecks(): (() => Promise<HealthIndicatorResult>)[] {
    return Object.entries(this._readinessChecks).map(checkWrapper);
  }

  addLivenessCheck(key: string, check: HealthCheck): void {
    if (key in this._livenessChecks) {
      throw new Error('key already exists');
    }
    this._livenessChecks[key] = check;
  }

  addReadinessCheck(key: string, check: HealthCheck): void {
    if (key in this._readinessChecks) {
      throw new Error('key already exists');
    }
    this._readinessChecks[key] = check;
  }

  removeLivenessCheck(key: string): void {
    delete this._livenessChecks[key];
  }

  removeReadinessCheck(key: string): void {
    delete this._readinessChecks[key];
  }
}
