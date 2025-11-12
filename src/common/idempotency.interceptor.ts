import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager'; // ✅ nur als Typ importieren

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'];
    if (!key) return next.handle();

    const cached = await this.cache.get<any>(`idem:${key}`);
    if (cached) return of(cached);

    return next.handle().pipe(
      tap(async (data) => {
        await this.cache.set(`idem:${key}`, data, 1800);
      }),
    );
  }
}
