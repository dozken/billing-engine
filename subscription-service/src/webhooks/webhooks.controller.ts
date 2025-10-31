import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle payment webhook from payment gateway' })
  @ApiBody({
    description: 'Payment webhook payload from gateway',
    schema: {
      type: 'object',
      properties: {
        subscriptionId: { type: 'string', example: 'sub_123456' },
        paymentId: { type: 'string', example: 'pay_987654' },
        success: { type: 'boolean', example: true },
      },
      required: ['subscriptionId', 'paymentId', 'success'],
    },
  })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  async handlePaymentWebhook(@Body() payload: PaymentWebhookDto) {
    return this.webhooksService.handlePaymentWebhook(payload);
  }
}
