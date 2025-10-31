import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma';

export interface PrismaSeedOptions {
  reset: boolean;
}

export interface PrismaSeedResult {
  userId: string;
  userEmail: string;
  userPassword: string;
  planBasicId: string;
  planProId: string;
  activeSubscriptionId: string;
}

export async function seedPrisma(
  options: PrismaSeedOptions,
): Promise<PrismaSeedResult> {
  const prisma = new PrismaClient();
  try {
    if (options.reset) {
      await prisma.subscription.deleteMany({});
      await prisma.plan.deleteMany({});
      await prisma.user.deleteMany({});
    }

    const userEmail = 'seed.user@example.com';
    const userPassword = 'Password123!';
    const hashed = await bcrypt.hash(userPassword, 10);

    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: {
        email: userEmail,
        name: 'Seed User',
        password: hashed,
      },
    });

    const basic = await prisma.plan.upsert({
      where: { id: 'fixed-basic' },
      update: {},
      create: {
        id: 'fixed-basic',
        name: 'Basic',
        description: 'Basic plan',
        price: 9.99,
        billingCycle: 'MONTHLY',
        features: ['feature-a'],
        isActive: true,
      },
    });

    const pro = await prisma.plan.upsert({
      where: { id: 'fixed-pro' },
      update: {},
      create: {
        id: 'fixed-pro',
        name: 'Pro',
        description: 'Pro plan',
        price: 29.99,
        billingCycle: 'MONTHLY',
        features: ['feature-a', 'feature-b'],
        isActive: true,
      },
    });

    const active = await prisma.subscription.upsert({
      where: { id: 'fixed-active-sub' },
      update: {},
      create: {
        id: 'fixed-active-sub',
        userId: user.id,
        planId: pro.id,
        status: 'ACTIVE',
        startDate: new Date(),
        price: pro.price,
      },
    });

    return {
      userId: user.id,
      userEmail,
      userPassword,
      planBasicId: basic.id,
      planProId: pro.id,
      activeSubscriptionId: active.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const result = await seedPrisma({ reset: true });
  // eslint-disable-next-line no-console
  console.log('Prisma seed done:', result);
}

void main();
