import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PaymentWebhookDto } from './dto/payment-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async handlePaymentWebhook(payload: PaymentWebhookDto) {
    const { subscriptionId, paymentId, success } = payload;

    try {
      const subscription = await this.subscriptionsService.handlePaymentWebhook(
        subscriptionId,
        paymentId,
        success,
      );

      return {
        success: true,
        subscription,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Subscription not found - this is acceptable for webhooks
        this.logger.warn(
          `Subscription ${subscriptionId} not found for webhook`,
        );
        return {
          success: false,
          error: 'Subscription not found',
        };
      }

      throw error;
    }
  }
}
