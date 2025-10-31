import { SubscriptionStatus } from '@generated/prisma';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Observable, of } from 'rxjs';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

interface MockSubscriptionDelegate {
  create: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  findFirst: jest.Mock<Promise<unknown | null>, [Record<string, unknown>]>;
  findMany: jest.Mock<Promise<unknown[]>, [Record<string, unknown>?]>;
  findUnique: jest.Mock<Promise<unknown | null>, [Record<string, unknown>]>;
  update: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
}

interface MockPrismaService {
  subscription: MockSubscriptionDelegate;
}

interface MockPlansService {
  findOne: jest.Mock<Promise<unknown>, [string]>;
}

interface MockHttpService {
  post: jest.Mock<Observable<{ data: unknown }>, [string, unknown?]>;
}

interface MockConfigService {
  get: jest.Mock<string, [string, string?]>;
}

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: MockPrismaService;
  let plansService: MockPlansService;
  let httpService: MockHttpService;
  let configService: MockConfigService;

  const mockPlan = {
    id: 'basic-plan',
    name: 'Basic Plan',
    description: 'Basic plan description',
    price: 9.99,
    billingCycle: 'MONTHLY',
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSubscription = {
    id: 'subscription-id',
    userId: 'user-id',
    planId: 'basic-plan',
    status: SubscriptionStatus.PENDING,
    startDate: null,
    endDate: null,
    paymentId: null,
    canceledAt: null,
    price: 9.99,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const;

  beforeEach(async () => {
    const mockPrisma: MockPrismaService = {
      subscription: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: PlansService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn().mockReturnValue(of({ data: {} })),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    prisma = mockPrisma;
    plansService = module.get(PlansService) as unknown as MockPlansService;
    httpService = module.get(HttpService) as unknown as MockHttpService;
    configService = module.get(ConfigService) as unknown as MockConfigService;

    configService.get.mockImplementation(
      (key: string, defaultValue?: string) => {
        if (key === 'PAYMENT_SERVICE_URL') return 'http://payment-service:3001';
        if (key === 'BASE_URL') return 'http://localhost:3000';
        return defaultValue ?? '';
      },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateSubscriptionDto = { planId: 'basic-plan' };
    const userId = 'user-id';

    it('should create a subscription successfully', async () => {
      const subscriptionWithRelations = {
        ...mockSubscription,
        user: {
          id: 'user-id',
          email: 'user@example.com',
          name: 'Test User',
          password: 'hashed',
          createdAt: new Date(),
          updatedAt: new Date(),
          subscriptions: [],
        },
        plan: mockPlan,
      };
      plansService.findOne.mockResolvedValue(mockPlan);
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue(mockSubscription);
      prisma.subscription.findUnique.mockResolvedValue(
        subscriptionWithRelations,
      );
      httpService.post.mockReturnValue(of({ data: {} }));

      const result = await service.create(createDto, userId);

      expect(plansService.findOne).toHaveBeenCalledWith('basic-plan');
      expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { userId, OR: [{ status: 'ACTIVE' }, { status: 'PENDING' }] },
      });
      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: { userId, planId: 'basic-plan', status: 'PENDING', price: 9.99 },
      });
      expect(result).toEqual(subscriptionWithRelations);
    });

    it('should throw BadRequestException if user has active subscription', async () => {
      plansService.findOne.mockResolvedValue(mockPlan);
      prisma.subscription.findFirst.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.ACTIVE,
      });

      await expect(service.create(createDto, userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(createDto, userId)).rejects.toThrow(
        'User already has an active or pending subscription',
      );

      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if user has pending subscription', async () => {
      plansService.findOne.mockResolvedValue(mockPlan);
      prisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      await expect(service.create(createDto, userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('should cancel subscription if payment initiation fails', async () => {
      plansService.findOne.mockResolvedValue(mockPlan);
      prisma.subscription.findFirst.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue(mockSubscription);
      httpService.post.mockImplementation(() => {
        throw new Error('Payment failed');
      });

      await expect(service.create(createDto, userId)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: mockSubscription.id },
        data: { status: SubscriptionStatus.CANCELLED },
      });
    });
  });

  describe('upgrade', () => {
    const subscriptionId = 'subscription-id';
    const newPlanId = 'pro-plan';
    const activeSubscription = {
      ...mockSubscription,
      id: subscriptionId,
      status: SubscriptionStatus.ACTIVE,
      planId: 'basic-plan',
    };
    const proPlan = {
      ...mockPlan,
      id: newPlanId,
      price: 29.99,
    };

    it('should upgrade subscription successfully', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce(activeSubscription)
        .mockResolvedValueOnce({
          ...activeSubscription,
          planId: newPlanId,
        });
      prisma.subscription.update.mockResolvedValue({
        ...activeSubscription,
        planId: newPlanId,
      });
      plansService.findOne.mockResolvedValueOnce(proPlan);
      plansService.findOne.mockResolvedValueOnce(mockPlan);
      httpService.post.mockReturnValue(of({ data: {} }));

      const result = await service.upgrade(subscriptionId, newPlanId);

      expect(plansService.findOne).toHaveBeenCalledWith(newPlanId);
      expect(plansService.findOne).toHaveBeenCalledWith('basic-plan');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: { planId: newPlanId },
      });
      expect(httpService.post).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.planId).toBe(newPlanId);
    });

    it('should throw BadRequestException if subscription is not active', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.PENDING,
      });

      await expect(service.upgrade(subscriptionId, newPlanId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.upgrade(subscriptionId, newPlanId)).rejects.toThrow(
        'Only active subscriptions can be upgraded',
      );
    });

    it('should throw BadRequestException if new plan price is not higher', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        ...activeSubscription,
      });
      // Return same plan for both new plan and current plan (same price)
      plansService.findOne.mockResolvedValue(mockPlan);

      await expect(
        service.upgrade(subscriptionId, 'basic-plan'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.upgrade(subscriptionId, 'basic-plan'),
      ).rejects.toThrow('New plan must have a higher price than current plan');
    });
  });

  describe('downgrade', () => {
    const subscriptionId = 'subscription-id';
    const newPlanId = 'basic-plan';
    const activeSubscription = {
      ...mockSubscription,
      id: subscriptionId,
      status: SubscriptionStatus.ACTIVE,
      planId: 'pro-plan',
    };
    const proPlan = {
      ...mockPlan,
      id: 'pro-plan',
      price: 29.99,
    };

    it('should downgrade subscription successfully', async () => {
      prisma.subscription.findUnique
        .mockResolvedValueOnce({ ...activeSubscription })
        .mockResolvedValueOnce({
          ...activeSubscription,
          planId: newPlanId,
        });
      plansService.findOne.mockResolvedValueOnce(mockPlan);
      plansService.findOne.mockResolvedValueOnce(proPlan);
      prisma.subscription.update.mockResolvedValue({});
      prisma.subscription.findUnique.mockResolvedValue({
        ...activeSubscription,
        planId: newPlanId,
      });

      const result = await service.downgrade(subscriptionId, newPlanId);

      expect(plansService.findOne).toHaveBeenCalledWith(newPlanId);
      expect(plansService.findOne).toHaveBeenCalledWith('pro-plan');
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: { planId: newPlanId },
      });
      expect(result.planId).toBe(newPlanId);
    });

    it('should throw BadRequestException if subscription is not active', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.PENDING,
      });

      await expect(
        service.downgrade(subscriptionId, newPlanId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.downgrade(subscriptionId, newPlanId),
      ).rejects.toThrow('Only active subscriptions can be downgraded');
    });

    it('should throw BadRequestException if new plan price is not lower', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        ...activeSubscription,
        user: {
          id: 'user-id',
          email: 'user@example.com',
          name: 'Test User',
          password: 'hashed',
          createdAt: new Date(),
          updatedAt: new Date(),
          subscriptions: [],
        },
      } as never);
      // Return same plan for both new plan and current plan (same price)
      plansService.findOne.mockResolvedValue(proPlan);

      await expect(
        service.downgrade(subscriptionId, 'pro-plan'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.downgrade(subscriptionId, 'pro-plan'),
      ).rejects.toThrow('New plan must have a lower price than current plan');
    });
  });

  describe('cancel', () => {
    const subscriptionId = 'subscription-id';
    const activeSubscription = {
      ...mockSubscription,
      id: subscriptionId,
      status: SubscriptionStatus.ACTIVE,
    };

    it('should cancel subscription successfully', async () => {
      const canceledDate = new Date();
      prisma.subscription.findUnique
        .mockResolvedValueOnce({ ...activeSubscription })
        .mockResolvedValueOnce({
          ...activeSubscription,
          status: SubscriptionStatus.CANCELLED,
          canceledAt: canceledDate,
        });
      prisma.subscription.update.mockResolvedValue({});

      const result = await service.cancel(subscriptionId);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.CANCELLED,
          canceledAt: expect.any(Date),
        },
      });
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
      expect(result.canceledAt).toBeDefined();
    });

    it('should throw BadRequestException if subscription is not active', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.PENDING,
      });

      await expect(service.cancel(subscriptionId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.cancel(subscriptionId)).rejects.toThrow(
        'Only active subscriptions can be cancelled',
      );
    });
  });

  describe('handlePaymentWebhook', () => {
    const subscriptionId = 'subscription-id';
    const paymentId = 'payment-id';

    it('should update subscription to ACTIVE when payment succeeds', async () => {
      const startDate = new Date();
      prisma.subscription.update.mockResolvedValue({});
      prisma.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.ACTIVE,
        paymentId,
        startDate,
      });

      const result = await service.handlePaymentWebhook(
        subscriptionId,
        paymentId,
        true,
      );

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          paymentId,
          startDate: expect.any(Date),
        },
      });
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.paymentId).toBe(paymentId);
    });

    it('should update subscription to CANCELLED when payment fails for new subscription', async () => {
      prisma.subscription.update.mockResolvedValue({});
      prisma.subscription.findUnique
        .mockResolvedValueOnce({
          ...mockSubscription,
          status: SubscriptionStatus.PENDING,
        })
        .mockResolvedValueOnce({
          ...mockSubscription,
          status: SubscriptionStatus.CANCELLED,
        });

      const result = await service.handlePaymentWebhook(
        subscriptionId,
        paymentId,
        false,
      );

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
    });

    it('should keep subscription ACTIVE when upgrade payment fails', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: SubscriptionStatus.ACTIVE,
      });

      const result = await service.handlePaymentWebhook(
        subscriptionId,
        paymentId,
        false,
      );

      // Should not update subscription when upgrade payment fails
      expect(prisma.subscription.update).not.toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });
});
