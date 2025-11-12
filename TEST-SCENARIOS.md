# Test-Szenarien für Integrationslösung

## Überblick

Diese Dokumentation beschreibt 5 Haupt-Test-Szenarien, die die Integrationslösung verifizieren:

1. **Happy Path:** Bestellung erfolgreich erstellt, gezahlt, an WMS weitergeleitet
2. **Scenario: Out of Stock:** Artikel nicht verfügbar → Bestellung storniert
3. **Scenario: Payment Declined:** Zahlung abgelehnt → Bestellung fehlgeschlagen
4. **Scenario: Partial Success:** Bestellung erstellt, aber WMS nicht erreichbar
5. **Scenario: Invalid Input:** Validierungsfehler beim Order-Create

---

## Scenario 1: Happy Path ✅

**Beschreibung:** Normale Bestellung mit erfolgreicher Reservierung, Zahlung und WMS-Weitergabe.

### Setup
```bash
# Terminal 1: OMS starten
npm run start:dev

# Terminal 2: Optional – RabbitMQ starten (für WMS-Events)
docker run -d --name rabbitmq rabbitmq:3.13-management

# Terminal 3: Optional – Inventory Service starten
cd src/inventory && npm install && node server.js
```

### Test-Requests (cURL oder Postman)

**1. POST /orders – Order erstellen**

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: happy-path-001" \
  -d '{
    "customerId": "CUST-MUELLER-001",
    "items": [
      {
        "sku": "LAPTOP-DELL-XPS13",
        "quantity": 1,
        "unitPrice": 1299.99
      },
      {
        "sku": "MOUSE-LOGITECH-MX",
        "quantity": 2,
        "unitPrice": 89.99
      },
      {
        "sku": "USB-KABEL-3M",
        "quantity": 3,
        "unitPrice": 19.99
      }
    ]
  }'
```

**Erwartete Response (201 Created):**
```json
{
  "orderId": "ORD-1762947202052",
  "status": "FULFILLMENT_QUEUED",
  "customerId": "CUST-MUELLER-001",
  "items": [
    {"sku": "LAPTOP-DELL-XPS13", "quantity": 1, "unitPrice": 1299.99},
    {"sku": "MOUSE-LOGITECH-MX", "quantity": 2, "unitPrice": 89.99},
    {"sku": "USB-KABEL-3M", "quantity": 3, "unitPrice": 19.99}
  ],
  "reservationId": "RES-1762947202052",
  "timestamps": {
    "createdAt": "2025-11-12T12:00:00.000Z",
    "updatedAt": "2025-11-12T12:00:00.000Z"
  }
}
```

**Logs (in Terminal 1):**
```
[NestJS] Order ORD-1762947202052 received (customer: CUST-MUELLER-001)
[NestJS] Order ORD-1762947202052 reserved (mock) - 1x LAPTOP-DELL-XPS13, 2x MOUSE-LOGITECH-MX, 3x USB-KABEL-3M
[NestJS] Order ORD-1762947202052 payment successful (mock) - Total: €1.589,95
[WMS-Bus] Published fulfillment.created for ORD-1762947202052
```

**2. GET /orders – Alle Orders abrufen**

```bash
curl -X GET http://localhost:3000/api/orders \
  -H "X-Correlation-Id: happy-path-001"
```

**Erwartete Response (200 OK):**
```json
{
  "data": [
    {
      "orderId": "ORD-1762947202052",
      "status": "FULFILLMENT_QUEUED",
      "customerId": "CUST-MUELLER-001",
      ...
    }
  ],
  "count": 1
}
```

**3. GET /orders/{orderId} – Einzelne Order abrufen**

```bash
curl -X GET http://localhost:3000/api/orders/ORD-1762947202052 \
  -H "X-Correlation-Id: happy-path-001"
```

**Erwartete Response (200 OK):**
```json
{
  "orderId": "ORD-1762947202052",
  "status": "FULFILLMENT_QUEUED",
  "customerId": "CUST-MUELLER-001",
  "items": [
    {"sku": "LAPTOP-DELL-XPS13", "quantity": 1, "unitPrice": 1299.99},
    {"sku": "MOUSE-LOGITECH-MX", "quantity": 2, "unitPrice": 89.99},
    {"sku": "USB-KABEL-3M", "quantity": 3, "unitPrice": 19.99}
  ],
  ...
}
```

---

## Scenario 2: Out of Stock ⚠️

**Beschreibung:** Artikel nicht verfügbar → Inventory-Reserve schlägt fehl → Bestellung wird storniert.

### Test-Request

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: out-of-stock-001" \
  -d '{
    "customerId": "CUST-SCHMIDT-WEBER",
    "items": [
      {
        "sku": "MONITOR-4K-48INCH",
        "quantity": 2,
        "unitPrice": 3999.99
      }
    ]
  }'
```

### Erwartete Response (409 Conflict oder 200 mit Status OUT_OF_STOCK)

Abhängig von Implementierung:

**Option A: HTTP 409 zurück**
```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Items not available in inventory - MONITOR-4K-48INCH (qty: 2 requested, 0 in stock)",
  "instance": "/api/orders",
  "correlationId": "out-of-stock-001"
}
```

**Option B: HTTP 201 mit Status OUT_OF_STOCK**
```json
{
  "orderId": "ORD-1762948000001",
  "status": "OUT_OF_STOCK",
  "customerId": "CUST-OUT-OF-STOCK",
  "items": [...],
  "message": "Reservation failed - items not in stock"
}
```

### Logs (erwartete Ausgabe)

```
[NestJS] Order ORD-1762948000001 received
[NestJS] Inventory check failed for ORD-1762948000001: SKUs not available
[NestJS] Setting order status to OUT_OF_STOCK
```

### Verifikation

```bash
# Order sollte mit Status OUT_OF_STOCK abrufbar sein
curl -X GET http://localhost:3000/api/orders/ORD-1762948000001
```

---

## Scenario 3: Payment Declined 💳

**Beschreibung:** Zahlung wird abgelehnt → Reservation wird freigegeben (Rollback) → Bestellung fehlgeschlagen.

### Vorbedingung

Falls echter Payment Service läuft (Port 3001), kann man einen Fehler simulieren. Lokal wird Payment oft mit Mock durchgeführt → Status `PAYMENT_DECLINED`.

### Test-Request

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: payment-fail-001" \
  -d '{
    "customerId": "CUST-VISA-DECLINE",
    "items": [
      {
        "sku": "EXPENSIVE-ITEM",
        "quantity": 1,
        "unitPrice": 99999.00
      }
    ]
  }'
```

### Erwartete Response (402 Payment Required oder 200 mit Status PAYMENT_DECLINED)

**Option A: HTTP 402**
```json
{
  "type": "about:blank",
  "title": "Payment Required",
  "status": 402,
  "detail": "Payment service declined the transaction",
  "instance": "/api/orders",
  "correlationId": "payment-fail-001"
}
```

**Option B: HTTP 201 mit Status PAYMENT_DECLINED** (aktuell)
```json
{
  "orderId": "ORD-1762948500001",
  "status": "PAYMENT_DECLINED",
  "customerId": "CUST-VISA-DECLINE",
  "items": [...],
  "reservationId": null,
  "message": "Payment failed; reservation was released"
}
```

### Logs

```
[NestJS] Order ORD-1762948500001 received
[NestJS] Order ORD-1762948500001 reserved (mock)
[NestJS] Payment call failed for ORD-1762948500001: getaddrinfo ENOTFOUND payments
[NestJS] Payment failed for ORD-1762948500001; marking as declined
[NestJS] Releasing reservation RES-1762948500001
```

### Verifikation

```bash
# Order sollte mit Status PAYMENT_DECLINED abrufbar sein
curl -X GET http://localhost:3000/api/orders/ORD-1762948500001
```

---

## Scenario 4: Partial Success (WMS nicht erreichbar) 🚀

**Beschreibung:** Bestellung erfolgreich erstellt & gezahlt, aber WMS nicht erreichbar → Order wird gespeichert, WMS-Nachricht wird übersprungen.

### Test-Request

**Vorbedingung:** RabbitMQ ist NOT läuft

```bash
# Beende RabbitMQ / Docker
docker stop rabbitmq 2>/dev/null || pkill -f rabbitmq

# Dann Order erstellen
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: partial-success-001" \
  -d '{
    "customerId": "CUST-PARTIAL",
    "items": [
      {
        "sku": "SKU-PARTIAL",
        "quantity": 1,
        "unitPrice": 50.00
      }
    ]
  }'
```

### Erwartete Response (201 Created)

```json
{
  "orderId": "ORD-1762949000001",
  "status": "FULFILLMENT_QUEUED",
  "customerId": "CUST-PARTIAL",
  "items": [...],
  "reservationId": "RES-1762949000001",
  "timestamps": {...}
}
```

### Logs

```
[NestJS] Order ORD-1762949000001 received
[NestJS] Order ORD-1762949000001 reserved (mock)
[NestJS] Order ORD-1762949000001 payment successful (mock)
[WMS-Bus] RabbitMQ publisher not ready, skipping publish
[NestJS] Order ORD-1762949000001 status: FULFILLMENT_QUEUED (but WMS not notified)
```

### Verifikation

```bash
# Order existiert lokal
curl -X GET http://localhost:3000/api/orders/ORD-1762949000001

# Aber WMS hat nichts bekommen
# (Nachrichtenqueue wäre leer oder enthält keine `fulfillment.created` Events)
```

---

## Scenario 5: Validation Error (Invalid Input) ❌

**Beschreibung:** Client sendet ungültige Daten → ValidationPipe wirft BadRequest (HTTP 400).

### Test-Request (fehlende `customerId`)

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: validation-fail-001" \
  -d '{
    "items": [
      {
        "sku": "SKU-1",
        "quantity": 1,
        "unitPrice": 29.99
      }
    ]
  }'
```

### Erwartete Response (400 Bad Request)

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "customerId should not be empty",
  "instance": "/api/orders",
  "correlationId": "validation-fail-001"
}
```

### Logs

```
[NestJS] Request validation failed for POST /api/orders
[NestJS] Errors: customerId should not be empty
```

### Weitere ungültige Requests

**a) Falscher Datentyp (`quantity` ist String statt Number)**

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUST-123",
    "items": [
      {
        "sku": "SKU-1",
        "quantity": "zwei",
        "unitPrice": 29.99
      }
    ]
  }'
```

**Erwartete Fehlermeldung:**
```json
{
  "status": 400,
  "detail": "quantity must be a number conforming to the specified constraints"
}
```

**b) Negative Menge**

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "CUST-123",
    "items": [
      {
        "sku": "SKU-1",
        "quantity": -5,
        "unitPrice": 29.99
      }
    ]
  }'
```

**Erwartete Fehlermeldung:**
```json
{
  "status": 400,
  "detail": "quantity must be a positive number"
}
```

---

## Test-Automatisierung (optional)

### Mit REST Client (VS Code Extension)

Speichere die Requests in `test-api.http`:
```
### Scenario 1: Happy Path
POST http://localhost:3000/api/orders
Content-Type: application/json
X-Correlation-Id: happy-path-001

{
  "customerId": "CUST-45823",
  "items": [...]
}

### Scenario 2: Out of Stock
POST http://localhost:3000/api/orders
Content-Type: application/json
X-Correlation-Id: out-of-stock-001

{
  "customerId": "CUST-OUT-OF-STOCK",
  "items": [{"sku": "P-UNAVAILABLE", "quantity": 100, ...}]
}

# ... weitere Szenarien
```

Dann klicke "Send Request" auf jeden Block.

### Mit Jest (optional)

```typescript
describe('Order Integration', () => {
  it('should create order and process payment (happy path)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .send({ customerId: 'CUST-1', items: [...] })
      .expect(201);
    
    expect(res.body.status).toBe('FULFILLMENT_QUEUED');
  });

  it('should fail if inventory unavailable (out of stock)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .send({ customerId: 'CUST-2', items: [{sku: 'UNAVAILABLE', ...}] })
      .expect(409);
    
    expect(res.body.detail).toContain('not available');
  });
});
```

---

## Zusammenfassung: Test-Matrix

| Scenario | Input | Expected Status | Key Assertions |
|----------|-------|-----------------|-----------------|
| 1. Happy Path | Valid order, inventory available, payment OK | 201, FULFILLMENT_QUEUED | Order created, WMS notified, logs OK |
| 2. Out of Stock | Valid order, but items unavailable | 409 oder 200 + OUT_OF_STOCK | Order rejected or marked as out-of-stock |
| 3. Payment Declined | Valid order, payment fails | 402 oder 200 + PAYMENT_DECLINED | Reservation released, no WMS notification |
| 4. Partial Success | Valid order, WMS unreachable | 201, FULFILLMENT_QUEUED | Order saved locally, WMS notification skipped |
| 5. Validation Error | Missing/invalid fields | 400, Bad Request | DTO validation errors, RFC7807 response |

