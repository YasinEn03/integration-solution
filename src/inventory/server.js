import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const PROTO_PATH =
  process.env.PROTO_PATH || join(process.cwd(), 'proto', 'inventory.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef).inventory;

const server = new grpc.Server();

server.addService(proto.InventoryService.service, {
  CheckAndReserve: (call, cb) => {
    const { orderId, items } = call.request;
    const outOfStock = items.some((i) => (i.quantity || 0) > 5);
    if (outOfStock)
      return cb(null, {
        status: 'OUT_OF_STOCK',
        reservationId: '',
        message: 'out of stock',
      });
    const reservationId = `RSV-${Date.now()}`;
    return cb(null, {
      status: 'AVAILABLE',
      reservationId,
      message: 'reserved',
    });
  },
  ReleaseReservation: (call, cb) => {
    const { reservationId } = call.request;
    return cb(null, { released: true, message: 'released' });
  },
});

const addr = `0.0.0.0:${process.env.PORT || 50051}`;
server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`inventory-mock gRPC up on ${addr}`);
  server.start();
});
