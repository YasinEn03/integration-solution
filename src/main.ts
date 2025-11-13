import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  Injectable,
  NestMiddleware,
  RequestMethod,
} from '@nestjs/common';
import * as express from 'express';
import { v4 as uuid } from 'uuid';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import * as swaggerUi from 'swagger-ui-express';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    req.correlationId = req.headers['x-correlation-id'] || uuid();
    res.setHeader('X-Correlation-Id', req.correlationId);
    next();
  }
}

function loadYamlSpec(relativePath: string) {
  const abs = join(process.cwd(), relativePath);
  if (!fs.existsSync(abs)) throw new Error(`OpenAPI spec not found at ${abs}`);
  const file = fs.readFileSync(abs, 'utf8');
  return JSON.parse(JSON.stringify(require('yaml').parse(file)));
}

async function bootstrap() {
  // ---------------------------
  // 1️⃣ OMS HTTP API starten
  // ---------------------------
  const OMS_PORT = parseInt(process.env.PORT || '3000', 10);
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors();
  app.use(new CorrelationIdMiddleware().use);
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'docs', method: RequestMethod.ALL }],
  });

  // Swagger/OpenAPI
  const specPath = 'specs/oms-openapi.yaml';
  const openApiDoc = loadYamlSpec(specPath);

  app.use(
    '/docs',
    swaggerUi.serveFiles(openApiDoc),
    swaggerUi.setup(openApiDoc, { explorer: true, validatorUrl: null }),
  );

  // Express fallback endpoint
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  expressApp.get('/payments', (_req, res) => {
    res.json({ ok: true, target: process.env.PAYMENT_SERVICE_URL });
  });

  // OMS HTTP starten
  await app.listen(OMS_PORT);
  console.log(`✅ OMS HTTP API running on http://localhost:${OMS_PORT}`);
  console.log(`📘 Swagger docs: http://localhost:${OMS_PORT}/docs`);
}

bootstrap().catch((err) => {
  console.error('OMS bootstrap failed:', err?.stack || err);
  process.exit(1);
});
