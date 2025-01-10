import { IncomingHttpHeaders } from 'http';

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { z, ZodSchema } from 'zod';

import { Optional } from '@/types';

const headerValueSchema = z.union([z.string(), z.array(z.string())]);

export function getHeader(headers: IncomingHttpHeaders, key: string): Optional<string | string[]> {
  return headers[key.toLowerCase()];
}

export type IncomingHeaderOptions = {
  key: string;
  schema: ZodSchema;
};

export function incomingHeader(headers: IncomingHttpHeaders, key: string): string | string[];
export function incomingHeader(
  headers: IncomingHttpHeaders,
  options: IncomingHeaderOptions,
): z.infer<(typeof options)['schema']>;

export function incomingHeader(headers: IncomingHttpHeaders, options: IncomingHeaderOptions | string): unknown {
  const key = typeof options === 'string' ? options : options.key;
  const schema = typeof options === 'string' ? headerValueSchema : options.schema;

  return schema.parse(getHeader(headers, key));
}

export const IncomingHeader = createParamDecorator(
  (options: string | IncomingHeaderOptions, ctx: ExecutionContext): unknown =>
    incomingHeader(ctx.switchToHttp().getRequest().headers, options as string),
);
