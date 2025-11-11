import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  NestMiddleware,
  Injectable,
  RequestMethod,
} from '@nestjs/common';
import * as express from 'express';
import { Request, Response } from 'express';
import * as fs from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import * as swaggerUi from 'swagger-ui-express';
import { v4 as uuid } from 'uuid';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import * as amqp from 'amqplib';

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
  if (!fs.existsSync(abs)) {
    throw new Error(`OpenAPI spec not found at ${abs}`);
  }
  const file = fs.readFileSync(abs, 'utf8');
  return parse(file);
}

function overrideServers(
  doc: any,
  servers: { url: string; description?: string }[],
) {
  return { ...doc, servers };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const portNumber = parseInt(process.env.PORT || '3000', 10);

  app.use(new CorrelationIdMiddleware().use);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors();

  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'docs', method: RequestMethod.ALL },
      { path: 'openapi', method: RequestMethod.ALL },
      { path: 'openapi/*', method: RequestMethod.ALL },
      { path: 'payments', method: RequestMethod.ALL },
    ],
  });

  const PAY_TARGET =
    process.env.PAYMENT_SERVICE_URL || 'http://payments:3001/api';
  app.use(
    '/api/payments',
    createProxyMiddleware({
      target: PAY_TARGET,
      changeOrigin: true,
      pathRewrite: { '^/api/payments': '' },
    }) as RequestHandler,
  );

  const preferredFiles = ['specs/oms-openapi.yaml'];
  const found = preferredFiles.find((p) =>
    fs.existsSync(join(process.cwd(), p)),
  );
  if (!found) {
    console.error(`[OpenAPI] Tried: ${preferredFiles.join(', ')}`);
    throw new Error(
      'No OpenAPI spec found in specs/ (expected combined-openapi.yaml or oms-openapi.yaml).',
    );
  }

  const absSpec = join(process.cwd(), found);
  console.log(`[OpenAPI] loading spec: ${absSpec}`);
  const combinedRaw = loadYamlSpec(found);

  const filteredPaths = Object.fromEntries(
    Object.entries(combinedRaw.paths).filter(
      ([path]) => !path.startsWith('/payments'),
    ),
  );

  const combinedDoc = overrideServers(
    { ...combinedRaw, paths: filteredPaths },
    [
      { url: '/api', description: 'Local OMS (this process)' },
      { url: '/api/payments', description: 'Payments (proxied)' },
    ],
  );

  app.use(
    '/docs',
    swaggerUi.serveFiles(combinedDoc),
    swaggerUi.setup(combinedDoc, {
      explorer: true,
      validatorUrl: null,
      customSiteTitle: 'Shop AG – OMS + Payments',
    }),
  );

  app.use('/openapi', express.static(join(process.cwd(), 'specs')));

  const expressApp = app.getHttpAdapter().getInstance() as express.Application;

  expressApp.get('/payments', (_req: Request, res: Response) => {
    res.json({ ok: true, target: PAY_TARGET });
  });

  await app.listen(portNumber);
  console.log(`✅ API running on http://localhost:${portNumber}`);
  console.log(`📘 Docs:      http://localhost:${portNumber}/docs`);
  console.log(
    `📄 OpenAPI:   http://localhost:${portNumber}/openapi/${found
      .split('/')
      .pop()}`,
  );
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
