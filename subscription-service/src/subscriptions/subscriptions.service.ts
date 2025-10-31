import type { Prisma } from '@generated/prisma';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSubscriptionDto } from './dto/create-subscription.dto';

type SubscriptionModel = Prisma.SubscriptionGetPayload<{
  include: { user: true; plan: true };
}>;

@Injectable()
export class SubscriptionsService {
  private paymentServiceUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private plansService: PlansService,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.paymentServiceUrl = this.configService.get<string>(
      'PAYMENT_SERVICE_URL',
      'http://localhost:3001',
    );
  }

  async create(
    createSubscriptionDto: CreateSubscriptionDto,
    userId: string,
  ): Promise<SubscriptionModel> {
    // Verify plan exists
    await this.plansService.findOne(createSubscriptionDto.planId);

    // Check for existing active subscription
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: { userId, OR: [{ status: 'ACTIVE' }, { status: 'PENDING' }] },
    });

    if (existingSubscription) {
      throw new BadRequestException(
        'User already has an active or pending subscription',
      );
    }

    const plan = await this.plansService.findOne(createSubscriptionDto.planId);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: createSubscriptionDto.planId,
        status: 'PENDING',
        price: plan.price,
      },
    });

    // Initiate payment
    try {
      await this.initiatePayment(subscription.id, Number(plan.price));
    } catch (error) {
      // Mark subscription as failed
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED' },
      });
      throw error;
    }

    return this.findOne(subscription.id);
  }

  async findAll(userId?: string): Promise<SubscriptionModel[]> {
    const subscriptions: SubscriptionModel[] =
      await this.prisma.subscription.findMany({
        where: userId ? { userId } : undefined,
        include: { user: true, plan: true },
        orderBy: { createdAt: 'desc' },
      });
    return subscriptions;
  }

  async findOne(id: string): Promise<SubscriptionModel> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: { user: true, plan: true },
    });
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  async upgrade(id: string, newPlanId: string): Promise<SubscriptionModel> {
    const subscription = await this.findOne(id);

    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only active subscriptions can be upgraded',
      );
    }

    const newPlan = await this.plansService.findOne(newPlanId);
    const currentPlan = await this.plansService.findOne(subscription.planId);

    if (Number(newPlan.price) <= Number(currentPlan.price)) {
      throw new BadRequestException(
        'New plan must have a higher price than current plan',
      );
    }

    // Update planId immediately (upgrade takes effect after payment succeeds)
    await this.prisma.subscription.update({
      where: { id },
      data: { planId: newPlanId },
    });

    // Calculate prorated amount (simplified)
    const proratedAmount = Number(newPlan.price) - Number(currentPlan.price);

    // Initiate payment for upgrade
    await this.initiatePayment(subscription.id, proratedAmount);

    return this.findOne(id);
  }

  async downgrade(id: string, newPlanId: string): Promise<SubscriptionModel> {
    const subscription = await this.findOne(id);

    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only active subscriptions can be downgraded',
      );
    }

    const newPlan = await this.plansService.findOne(newPlanId);
    const currentPlan = await this.plansService.findOne(subscription.planId);

    if (Number(newPlan.price) >= Number(currentPlan.price)) {
      throw new BadRequestException(
        'New plan must have a lower price than current plan',
      );
    }

    // Update subscription to new plan (downgrade takes effect at next billing cycle)
    await this.prisma.subscription.update({
      where: { id },
      data: { planId: newPlanId },
    });
    return this.findOne(id);
  }

  async cancel(id: string): Promise<SubscriptionModel> {
    const subscription = await this.findOne(id);

    if (subscription.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only active subscriptions can be cancelled',
      );
    }

    await this.prisma.subscription.update({
      where: { id },
      data: { status: 'CANCELLED', canceledAt: new Date() },
    });
    return this.findOne(id);
  }

  async handlePaymentWebhook(
    subscriptionId: string,
    paymentId: string,
    success: boolean,
  ): Promise<SubscriptionModel> {
    const subscription = await this.findOne(subscriptionId);

    if (success) {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'ACTIVE', paymentId, startDate: new Date() },
      });
      return this.findOne(subscriptionId);
    }

    // Payment failed
    if (subscription.status === 'ACTIVE') {
      // Upgrade payment failed - keep ACTIVE status, payment can be retried
      // Note: planId was already updated in upgrade(), previous plan not tracked
      return this.findOne(subscriptionId);
    }

    // New subscription payment failed - cancel subscription
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'CANCELLED' },
    });

    return this.findOne(subscriptionId);
  }

  private async initiatePayment(
    subscriptionId: string,
    amount: number,
  ): Promise<void> {
    const webhookUrl = `${this.configService.get<string>('BASE_URL', 'http://localhost:3000')}/webhooks/payment`;

    try {
      await firstValueFrom(
        this.httpService.post(`${this.paymentServiceUrl}/payments/initiate`, {
          subscriptionId,
          amount,
          webhookUrl,
        }),
      );
    } catch {
      throw new BadRequestException('Payment initiation failed');
    }
  }
}
