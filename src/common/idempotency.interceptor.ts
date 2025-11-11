import { CallHandler, ExecutionContext, Injectable, NestInterceptor, BadRequestException } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Cache } from 'cache-manager';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private cache: Cache) {}
  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'];
    if (!key) return next.handle();

    const cached = await this.cache.get<any>(`idem:${key}`);
    if (cached) return of(cached);

    return next.handle().pipe(
      tap(async (data) => {
        await this.cache.set(`idem:${key}`, data, 1800);
      })
    );
  }
}
