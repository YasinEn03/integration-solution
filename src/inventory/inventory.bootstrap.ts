import { NestFactory } from '@nestjs/core';
import { InventoryModule } from './inventory.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrapInventory() {
  const app = await NestFactory.create(InventoryModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = 3002;
  await app.listen(port);
  console.log(`✅ Inventory-Service running at http://localhost:${port}`);
}

bootstrapInventory().catch((err) => {
  console.error('Inventory bootstrap failed:', err);
  process.exit(1);
});
