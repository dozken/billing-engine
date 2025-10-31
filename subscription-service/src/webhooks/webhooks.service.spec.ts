import { SubscriptionStatus } from '@generated/prisma';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { WebhooksService } from './webhooks.service';

interface MockSubscriptionsService {
  handlePaymentWebhook: jest.Mock<Promise<any>, [string, string, boolean]>;
}

describe('WebhooksService', () => {
  let service: WebhooksService;
  let subscriptionsService: MockSubscriptionsService;

  const mockSubscription = {
    id: 'subscription-id',
    userId: 'user-id',
    planId: 'basic-plan',
    status: SubscriptionStatus.ACTIVE,
    startDate: new Date(),
    endDate: null,
    paymentId: 'payment-id',
    canceledAt: null,
    price: 9.99,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Test User',
      password: 'hashed',
      createdAt: new Date(),
      updatedAt: new Date(),
      subscriptions: [],
    },
    plan: {
      id: 'basic-plan',
      name: 'Basic Plan',
      description: 'Basic plan description',
      price: 9.99,
      billingCycle: 'MONTHLY',
      features: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      subscriptions: [],
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: SubscriptionsService,
          useValue: {
            handlePaymentWebhook: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    subscriptionsService = module.get(
      SubscriptionsService,
    ) as unknown as MockSubscriptionsService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handlePaymentWebhook', () => {
    const webhookPayload: PaymentWebhookDto = {
      subscriptionId: 'subscription-id',
      paymentId: 'payment-id',
      success: true,
    };

    it('should handle payment webhook successfully', async () => {
      subscriptionsService.handlePaymentWebhook.mockResolvedValue(
        mockSubscription,
      );

      const result = await service.handlePaymentWebhook(webhookPayload);

      expect(subscriptionsService.handlePaymentWebhook).toHaveBeenCalledWith(
        webhookPayload.subscriptionId,
        webhookPayload.paymentId,
        webhookPayload.success,
      );
      expect(result).toEqual({
        success: true,
        subscription: mockSubscription,
      });
    });

    it('should return error response when subscription not found', async () => {
      subscriptionsService.handlePaymentWebhook.mockRejectedValue(
        new NotFoundException('Subscription not found'),
      );

      const result = await service.handlePaymentWebhook(webhookPayload);

      expect(subscriptionsService.handlePaymentWebhook).toHaveBeenCalledWith(
        webhookPayload.subscriptionId,
        webhookPayload.paymentId,
        webhookPayload.success,
      );
      expect(result).toEqual({
        success: false,
        error: 'Subscription not found',
      });
    });

    it('should rethrow non-NotFoundException errors', async () => {
      const error = new Error('Unexpected error');
      subscriptionsService.handlePaymentWebhook.mockRejectedValue(error);

      await expect(
        service.handlePaymentWebhook(webhookPayload),
      ).rejects.toThrow('Unexpected error');
    });
  });
});
