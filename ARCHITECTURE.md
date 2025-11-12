# Integration-Solution – Architektur & Design

## 1. Systemüberblick

Die Shop AG-Integrationslösung verbindet vier Hauptsysteme für automatisierte Bestellverarbeitung:

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway / OMS                          │
│                    (NestJS auf Port 3000)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ POST /orders │  │ GET /orders  │  │ PUT /orders  │          │
│  │ (CREATE)     │  │ (LIST/GET)   │  │ (UPDATE)     │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                       │
│         └─────────────────────────────────────────┐            │
│                                                   │            │
│                                                   ▼            │
│  ┌──────────────────────────────────────────────────────┐     │
│  │        OrdersService (Business Logic)               │     │
│  │  ┌─────────────────────────────────────────────┐    │     │
│  │  │ 1. Validate Order (DTO + ValidationPipe)   │    │     │
│  │  │ 2. Reserve Inventory (gRPC → Inventory)    │    │     │
│  │  │ 3. Process Payment (REST → Payment Service)│    │     │
│  │  │ 4. Publish to WMS (RabbitMQ)               │    │     │
│  │  │ 5. Update Status & Log                     │    │     │
│  │  └─────────────────────────────────────────────┘    │     │
│  └──────────────────────────────────────────────────────┘     │
│         │              │              │              │        │
└─────────┼──────────────┼──────────────┼──────────────┼────────┘
          │              │              │              │
         gRPC           REST          RabbitMQ       Logging
          │              │              │              │
          ▼              ▼              ▼              ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Inventory│  │ Payment  │  │   WMS    │  │  Logs    │
    │ Service  │  │ Service  │  │ (Legacy) │  │  (File)  │
    │ (gRPC)   │  │ (REST)   │  │(RabbitMQ)│  │          │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## 2. Komponenten & Schnittstellen

### 2.1 Order Management System (OMS) – NestJS REST API

**Port:** 3000  
**Basis-URL:** `http://localhost:3000/api`  
**Dokumentation:** http://localhost:3000/docs (Swagger UI)

#### Endpoints:
- `POST /orders` – Neue Bestellung erstellen
- `GET /orders` – Alle Bestellungen abrufen
- `GET /orders/{orderId}` – Einzelne Bestellung abrufen
- `POST /orders/{orderId}/cancel` – Bestellung stornieren
- `POST /orders/{orderId}/status-updates` – Status-Update von WMS

**OpenAPI Spec:** `specs/oms-openapi.yaml`

### 2.2 Inventory Service – gRPC

**Port:** 5000 (hypothetisch)  
**Protokoll:** gRPC mit Protocol Buffers  
**Datei:** `proto/inventory.proto`

#### RPCs:
- `CheckAvailability(items)` → `{available: boolean}`
- `ReserveItems(reservationId, items)` → `{reservationId: string, status: "RESERVED"}`
- `ReleaseReservation(reservationId)` → `{status: "RELEASED"}`

**Proto-Definition:**
```protobuf
message ReservationRequest {
  string reservation_id = 1;
  repeated Item items = 2;
}

message Item {
  string product_id = 1;
  int32 quantity = 2;
}

message ReservationResponse {
  string reservation_id = 1;
  enum Status { RESERVED = 0; FAILED = 1; }
  Status status = 2;
}
```

### 2.3 Payment Service – REST API

**Port:** 3001  
**Basis-URL:** `http://localhost:3001/api`  
**Proxy-Route:** `/api/payments` (in OMS auf Port 3000)

#### Endpoints:
- `POST /payments` – Zahlung durchführen (authorize + optional capture)
- `GET /payments/{paymentId}` – Zahlungsstatus abrufen
- `POST /payments/{paymentId}/capture` – Autorisierung erfassen (Capture)
- `POST /payments/{paymentId}/refund` – Rückerstattung

**Request-Body Beispiel (Authorize-only):**
```json
{
  "orderId": "ORD-123",
  "amount": 209.97,
  "currency": "EUR",
  "capture": false
}
```

### 2.4 Warehouse Management System (WMS) – RabbitMQ

**Broker:** RabbitMQ (amqp://guest:guest@localhost:5672)  
**Exchange:** `wms` (topic)

#### Published Events:
1. **fulfillment.created** – OMS publiziert nach erfolgreicher Bestellung
   ```json
   {
     "orderId": "ORD-123",
     "items": [{"productId": "P-8821", "quantity": 2}],
     "shippingAddress": {...},
     "occurredAt": "2025-11-12T12:00:00.000Z"
   }
   ```

2. **status.updated** – WMS publiziert Status-Änderungen
   ```json
   {
     "orderId": "ORD-123",
     "eventType": "ITEMS_PICKED|ORDER_PACKED|ORDER_SHIPPED",
     "timestamp": "2025-11-12T12:05:00.000Z"
   }
   ```

## 3. Datenflüsse

### Happy Path: Bestellung erfolgreich verarbeitet

```
1. Client → OMS: POST /orders
   ├─ Request: OrderCreateRequest (customerId, items, shippingAddress)
   │
2. OMS → Inventory Service: gRPC CheckAvailability + Reserve
   ├─ Request: ReservationRequest
   ├─ Response: ReservationResponse (status: RESERVED, reservationId)
   │
3. OMS → Payment Service: POST /payments
   ├─ Request: PaymentCreateRequest (orderId, amount, capture: true)
   ├─ Response: Payment (status: CAPTURED, paymentId)
   │
4. OMS → WMS: RabbitMQ publish(fulfillment.created)
   ├─ Message: Fulfillment event
   │
5. OMS → Client: 201 Created
   └─ Response: Order (status: FULFILLMENT_QUEUED, orderId, timestamps)

6. WMS → OMS: RabbitMQ publish(status.updated)
   ├─ Messages: ITEMS_PICKED → ORDER_PACKED → ORDER_SHIPPED
   │
7. OMS → Logging: Alle Schritte in Log-Datei
   └─ Datei: logs/orders.log
```

### Error Path: Artikel nicht verfügbar

```
1. Client → OMS: POST /orders
   │
2. OMS → Inventory Service: gRPC Reserve
   ├─ Response: ReservationResponse (status: FAILED)
   │
3. OMS → Client: 409 Conflict
   └─ Response: Order (status: OUT_OF_STOCK, message: "Items not available")

4. OMS → Logging: Fehlerfall mit Ursache
   └─ Log: "Order ORD-123: Inventory reservation FAILED"
```

### Error Path: Zahlung abgelehnt

```
1. Client → OMS: POST /orders
   │
2. OMS → Inventory Service: gRPC Reserve ✓
   │
3. OMS → Payment Service: POST /payments
   ├─ Response: Payment (status: DECLINED)
   │
4. OMS → Inventory Service: ReleaseReservation (Rollback)
   │
5. OMS → Client: 402 Payment Required
   └─ Response: Order (status: PAYMENT_DECLINED, message: "Payment failed")

6. OMS → Logging: Fehlerfall mit Rollback
   └─ Log: "Order ORD-123: Payment DECLINED; Reservation released"
```

## 4. Fehlersituationen & Auflösung

### 4.1 Inventarsystem nicht erreichbar

**Problem:** gRPC-Aufruf schlägt fehl.

**Behandlung:**
- Catch in OrdersService: `try-catch` um gRPC-Client-Aufruf
- Log Fehler: `WARN [OrdersService] Inventory check failed for ORD-123: <error>`
- Status auf Order: `RESERVED` → Bestellung wird mit Mock-Daten fortgesetzt (Demo-Modus)
- Alternativ: HTTP 503 (Service Unavailable) zurückgeben

**Code-Beispiel:**
```typescript
try {
  const reservation = await this.inventoryClient.reserve(...);
} catch (err) {
  this.logger.warn(`Inventory unavailable, using mock reservation: ${err.message}`);
  // Oder: throw new ServiceUnavailableException('Inventory Service down');
}
```

### 4.2 Zahlungsservice nicht erreichbar

**Problem:** REST-Aufruf schlägt fehl oder Timeout.

**Behandlung:**
- Catch in OrdersService: `try-catch` um HTTP-Request
- Log Warning: `WARN [OrdersService] Payment call failed for ORD-123: <error>`
- Status auf Order: `PAYMENT_DECLINED` (sicherer Standard)
- Möglich: Exponential Backoff + Retry (aktuell nicht implementiert)

**Code-Beispiel:**
```typescript
try {
  const payment = await this.paymentService.create(dto);
} catch (err) {
  this.logger.warn(`Payment service failed, marking as declined: ${err.message}`);
  order.status = 'PAYMENT_DECLINED';
  // Nicht weiterleiten an WMS
}
```

### 4.3 RabbitMQ nicht erreichbar

**Problem:** Verbindung zu Broker fehlgeschlagen.

**Behandlung:**
- Catch im WmsBus: `try-catch` in `onModuleInit()`
- Log Warning: `WARN [WmsBus] RabbitMQ connection failed (optional)`
- Flag: `this.pub` bleibt `null`
- Bei Publish: Check `if (!this.pub) { warn("RabbitMQ not ready"); return; }`
- Bestellung wird trotzdem erstellt und gespeichert (Graceful Degradation)

**Code-Beispiel:**
```typescript
async publishFulfillmentCreated(payload: any) {
  if (!this.pub) {
    console.warn('RabbitMQ publisher not ready, skipping publish');
    return;
  }
  this.pub.publish(...);
}
```

### 4.4 Validierungsfehler (DTO)

**Problem:** Client sendet ungültige Daten (fehlende Felder, falscher Typ).

**Behandlung:**
- Global ValidationPipe in main.ts: `whitelist: true`, `forbidNonWhitelisted: true`
- Exception: `BadRequestException` (HTTP 400)
- Response: RFC7807 ProblemDetails mit Message und CorrelationId

**Beispiel Request (ungültig):**
```json
{
  "customerId": "CUST-123",
  "items": [
    {
      "sku": "SKU-1",
      "quantity": "zwei"  // ❌ sollte: number
    }
  ]
}
```

**Antwort (400):**
```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "quantity must be a number conforming to the specified constraints",
  "instance": "/api/orders",
  "correlationId": "f8691461-2510-4a3b-b258-69a87f6de911"
}
```

## 5. Implementierungs-Details

### Technology Stack
- **Framework:** NestJS (TypeScript)
- **REST:** Express (via @nestjs/platform-express)
- **gRPC:** @grpc/grpc-js + @grpc/proto-loader
- **Messaging:** RabbitMQ (amqplib, amqp-connection-manager)
- **Caching/Infra:** ioredis, cache-manager (optional)
- **Validation:** class-validator, class-transformer
- **Testing:** Jest

### Projekt-Struktur
```
src/
├── main.ts                 # Bootstrap, Middleware, Proxy
├── app.module.ts           # Root Module
├── common/
│   ├── problem-details.filter.ts  # RFC7807 Error Handler
│   └── idempotency.interceptor.ts # Idempotenz-Handling
├── oms/
│   ├── orders.controller.ts        # HTTP Endpoints
│   ├── orders.service.ts           # Business Logic
│   ├── order.dto.ts                # DTO Classes
│   └── oms.module.ts
├── payment/
│   ├── payment.controller.ts
│   ├── payment.service.ts
│   ├── payment.entity.ts           # TypeORM Entity
│   ├── dto/payment-create.dto.ts
│   └── payment.module.ts
├── inventory/
│   ├── inventory.client.ts         # gRPC Client
│   ├── inventory.module.ts
│   └── server.js                   # Standalone gRPC Server (Node.js)
├── wms/
│   ├── wms.messaging.ts            # RabbitMQ Bus
│   ├── wms.service.ts              # WMS Integration
│   └── wms.module.ts
└── ...
proto/
├── inventory.proto         # gRPC Service Definition
specs/
├── oms-openapi.yaml        # OpenAPI 3.0 Spec
```

### Module-Import-Order
```typescript
// app.module.ts
imports: [
  InventoryModule,    // gRPC Client erster, damit Order-Service abhängig ist
  WmsModule,         // RabbitMQ Bus zweiter
  OmsModule,         // OMS letzer, nutzt alle anderen Services
]
```

## 6. Deployment & Lokales Setup

### Docker Compose (für alle Services)
```bash
docker-compose up --build
```

Startet:
- OMS (NestJS) auf Port 3000
- Payment-Stub (Express) auf Port 3001
- RabbitMQ auf Port 5672
- Inventory-Server (gRPC) auf Port 5000

### Lokal (Development)
```bash
npm install
npm run start:dev      # NestJS auf :3000 mit Watch
npm run build          # Compile TypeScript → dist/
npm run test           # Jest (falls konfiguriert)
```

## 7. Häufige Fehlerquellen & Debugging

| Problem | Ursache | Lösung |
|---------|--------|--------|
| HTTP 500 beim POST /orders | Inventory gRPC nicht erreichbar | Inventory Server starten: `npm run start` in `inventory/` |
| HTTP 500 beim POST /orders | Payment Service nicht erreichbar | Payment Service nicht zwingend, wird als DECLINED markiert |
| RabbitMQ Verbindungsfehler | Broker nicht läuft | `docker run -d rabbitmq:3.13-management` |
| gRPC ECONNREFUSED | gRPC Port falsch konfiguriert | Proto-Datei und inventory.client.ts synchronisieren |
| Zirkuläre Dependencies | Module importieren sich gegenseitig | Module-Import-Order checken (Inventory → WMS → OMS) |

## 8. Zukünftige Verbesserungen

- [ ] Idempotenz-Keys für Orders (duplicate prevention)
- [ ] Circuit Breaker Pattern für externe Services (resilience4j-ähnlich)
- [ ] Distributed Transaction / Saga Pattern für Rollback
- [ ] Persistent Event Sourcing statt In-Memory Store
- [ ] Database (PostgreSQL + TypeORM) für Produktion
- [ ] API Rate Limiting
- [ ] Authentifizierung (OAuth2 / JWT)
- [ ] Structured Logging (Winston, Pino)
- [ ] Monitoring & Observability (Prometheus, Jaeger)
