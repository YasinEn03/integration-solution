import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { InventoryModule } from './inventory/inventory.module';
import { InventoryGrpcClient } from './inventory/inventory.client';
import { Transport } from '@nestjs/microservices';
import { join } from 'path';
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
  const INVENTORY_URL = process.env.INVENTORY_GRPC_URL || '127.0.0.1:50051';
  const OMS_PORT = parseInt(process.env.PORT || '3000', 10);

  // ---------------------------
  // 1️⃣ Inventory gRPC Microservice starten
  // ---------------------------
  const inventoryApp = await NestFactory.createMicroservice(InventoryModule, {
    transport: Transport.GRPC,
    options: {
      package: 'inventory',
      protoPath: join(process.cwd(), 'proto/inventory.proto'),
      url: INVENTORY_URL,
    },
  });

  await inventoryApp.listen();
  console.log(`✅ Inventory gRPC service running on ${INVENTORY_URL}`);

  // ---------------------------
  // 2️⃣ OMS HTTP API starten
  // ---------------------------
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
  if (!fs.existsSync(join(process.cwd(), specPath)))
    throw new Error('OpenAPI spec not found');
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

  // ---------------------------
  // 3️⃣ gRPC Client auf Ready-State warten
  // ---------------------------
  const inventoryClient = app.get<InventoryGrpcClient>(InventoryGrpcClient);
  await new Promise<void>((resolve, reject) => {
    const grpcRaw = (inventoryClient as any).client['client'];
    grpcRaw.waitForReady(Date.now() + 5000, (err: any) => {
      if (err) return reject(err);
      console.log('✅ Inventory gRPC client ready');
      resolve();
    });
  });

  // ---------------------------
  // 4️⃣ OMS HTTP starten
  // ---------------------------
  await app.listen(OMS_PORT);
  console.log(`✅ OMS HTTP API running on http://localhost:${OMS_PORT}`);
  console.log(`📘 Swagger docs: http://localhost:${OMS_PORT}/docs`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err?.stack || err);
  process.exit(1);
});
