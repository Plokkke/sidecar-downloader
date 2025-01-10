import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl, body, params, query } = request;

    this.logger.log(
      `Incoming Request: ${method} ${originalUrl} - Body: ${JSON.stringify(
        body,
      )} - Params: ${JSON.stringify(params)} - Query: ${JSON.stringify(query)}`,
    );

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const delay = Date.now() - now;
        this.logger.log(`Response: ${method} ${originalUrl} ${statusCode} - ${delay}ms`);
      }),
      catchError((error) => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        this.logger.error(`Error Response: ${method} ${originalUrl} ${statusCode} - ${error.message}`);
        throw error;
      }),
    );
  }
}
