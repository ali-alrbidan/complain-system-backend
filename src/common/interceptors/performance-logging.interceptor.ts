// src/common/interceptors/performance-logging.interceptor.ts
// قياس الأداء (AOP)
// ============================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class PerformanceLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const executionTime = Date.now() - startTime;

        // تحذير إذا كانت العملية بطيئة (أكثر من 1 ثانية)
        if (executionTime > 1000) {
          console.warn(
            `⚠️ Slow operation detected: ${method} ${url} took ${executionTime}ms`,
          );
        } else {
          console.log(`✅ ${method} ${url} completed in ${executionTime}ms`);
        }
      }),
    );
  }
}
