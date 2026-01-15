// ============================================
// src/auth/guards/throttle.guard.ts
// حماية من Brute Force Attacks
// ============================================

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // تتبع حسب IP أو username
    return req.body?.email || req.body?.phone || req.ip;
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // لا تطبق Rate Limiting على الـ Health Check
    return request.url === '/api/health';
  }
}
