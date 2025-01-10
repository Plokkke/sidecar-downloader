import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export class NoErrorThrownError extends Error {}

export const getError = async (call: () => unknown): Promise<unknown> => {
  try {
    await call();

    return new NoErrorThrownError();
  } catch (error: unknown) {
    return error;
  }
};

export function getExecutionContextMock(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
