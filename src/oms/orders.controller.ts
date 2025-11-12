import { Controller, Post, Body, Get, Param, Logger } from '@nestjs/common';
import { OmsService, Order } from './orders.service';

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly omsService: OmsService) {}

  @Post()
  async create(
    @Body() body: { items: any[]; firstName: string; lastName: string },
  ) {
    this.logger.log(`Empfange Bestellung: ${body.firstName} ${body.lastName}`);
    try {
      const order = await this.omsService.createOrder(body);
      return { id: order.id, status: order.state, data: order };
    } catch (err) {
      this.logger.warn(
        `Fehler beim Erstellen der Bestellung: ${err.message || err}`,
      );
      return {
        message: 'Fehler beim Erstellen der Bestellung',
        error: err.response || err.message || err,
      };
    }
  }

  @Get(':id')
  getOrderById(@Param('id') id: string) {
    try {
      const order = this.omsService.getOrder(id);
      return { data: order };
    } catch (err) {
      this.logger.warn(`OrderID ${id} nicht gefunden`);
      return { message: 'Order not found', id };
    }
  }

  @Get()
  getAll() {
    const ordersMap = this.omsService.getAllOrders();
    const allOrders = Array.from(ordersMap.values());
    return { data: allOrders, total: allOrders.length };
  }
}
