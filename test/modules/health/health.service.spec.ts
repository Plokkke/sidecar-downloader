import { HealthCheckError } from '@nestjs/terminus';

import { getError } from '?/utils';

import { HealthService } from '@/modules/health/health.service';

async function checkCompute(checks: (() => Promise<unknown>)[]): Promise<unknown[]> {
  return Promise.allSettled(checks.map((c) => c()));
}

describe('Health service tests suite', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService() as unknown as HealthService & {
      _livenessChecks: Record<string, jest.Mock>;
      _readinessChecks: Record<string, jest.Mock>;
    };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addLivenessCheck', () => {
    it('should add a liveness check', () => {
      service.addLivenessCheck('test', () => true);
      expect(service['_livenessChecks']).toHaveProperty('test', expect.any(Function));
    });

    it('should throw an error if the check is already registered', async () => {
      service.addLivenessCheck('test', () => true);
      const error = await getError(() => service.addLivenessCheck('test', () => true));

      expect(error).toBeInstanceOf(Error);
      const err = error as Error;
      expect(err.message).toBe('key already exists');
    });
  });

  describe('addReadinessCheck', () => {
    it('should add a readiness check', () => {
      service.addReadinessCheck('test', () => true);
      expect(service['_readinessChecks']).toHaveProperty('test', expect.any(Function));
    });

    it('should throw an error if the check is already registered', async () => {
      service.addReadinessCheck('test', () => true);
      const error = await getError(() => service.addReadinessCheck('test', () => true));

      expect(error).toBeInstanceOf(Error);
      const err = error as Error;
      expect(err.message).toBe('key already exists');
    });
  });

  describe('removeLivenessCheck', () => {
    it('should remove a liveness check', async () => {
      service.addLivenessCheck('test', () => true);
      await service.removeLivenessCheck('test');
      expect(service['_livenessChecks']).not.toHaveProperty('test');
    });
  });

  describe('removeReadinessCheck', () => {
    it('should remove a readiness check', async () => {
      service.addReadinessCheck('test', () => true);
      await service.removeReadinessCheck('test');
      expect(service['_readinessChecks']).not.toHaveProperty('test');
    });
  });

  describe('livenessChecks', () => {
    it('should return the liveness checks succeeded', async () => {
      service.addLivenessCheck('test1', jest.fn().mockResolvedValue(true));
      service.addLivenessCheck('test2', jest.fn().mockResolvedValue(true));
      service.addLivenessCheck('test3', jest.fn().mockResolvedValue(true));
      const checks = service.livenessChecks;
      expect(checks).toHaveLength(3);
      expect(await checkCompute(checks)).toStrictEqual([
        { status: 'fulfilled', value: { test1: { status: 'up' } } },
        { status: 'fulfilled', value: { test2: { status: 'up' } } },
        { status: 'fulfilled', value: { test3: { status: 'up' } } },
      ]);
      for (const [, check] of Object.entries(service['_livenessChecks'])) {
        expect(check).toHaveBeenCalled();
      }
    });

    it('should return the liveness checks failed', async () => {
      service.addLivenessCheck('test1', jest.fn().mockResolvedValue(true));
      service.addLivenessCheck('test2', jest.fn().mockResolvedValue(false));
      service.addLivenessCheck('test3', jest.fn().mockResolvedValue(true));
      const checks = service.livenessChecks;
      expect(checks).toHaveLength(3);
      expect(await checkCompute(checks)).toStrictEqual([
        { status: 'fulfilled', value: { test1: { status: 'up' } } },
        { status: 'rejected', reason: new HealthCheckError('Health check failed', { test2: { status: 'down' } }) },
        { status: 'fulfilled', value: { test3: { status: 'up' } } },
      ]);
      for (const [, check] of Object.entries(service['_livenessChecks'])) {
        expect(check).toHaveBeenCalled();
      }
    });
  });

  describe('readinessChecks', () => {
    it('should return the readiness checks succeeded', async () => {
      service.addReadinessCheck('test1', jest.fn().mockResolvedValue(true));
      service.addReadinessCheck('test2', jest.fn().mockResolvedValue(true));
      service.addReadinessCheck('test3', jest.fn().mockResolvedValue(true));
      const checks = service.readinessChecks;
      expect(checks).toHaveLength(3);
      expect(await checkCompute(checks)).toStrictEqual([
        { status: 'fulfilled', value: { test1: { status: 'up' } } },
        { status: 'fulfilled', value: { test2: { status: 'up' } } },
        { status: 'fulfilled', value: { test3: { status: 'up' } } },
      ]);
      for (const [, check] of Object.entries(service['_readinessChecks'])) {
        expect(check).toHaveBeenCalled();
      }
    });

    it('should return the readiness checks failed', async () => {
      service.addReadinessCheck('test1', jest.fn().mockResolvedValue(true));
      service.addReadinessCheck('test2', jest.fn().mockResolvedValue(false));
      service.addReadinessCheck('test3', jest.fn().mockResolvedValue(true));
      const checks = service.readinessChecks;
      expect(checks).toHaveLength(3);
      expect(await checkCompute(checks)).toStrictEqual([
        { status: 'fulfilled', value: { test1: { status: 'up' } } },
        { status: 'rejected', reason: new HealthCheckError('Health check failed', { test2: { status: 'down' } }) },
        { status: 'fulfilled', value: { test3: { status: 'up' } } },
      ]);
      for (const [, check] of Object.entries(service['_readinessChecks'])) {
        expect(check).toHaveBeenCalled();
      }
    });
  });
});
