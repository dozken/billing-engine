import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env', // Local overrides (service-specific)
        '../../.env', // Global defaults (shared with root)
      ],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Check both ConfigService and process.env for NODE_ENV
        const nodeEnv =
          configService.get<string>('NODE_ENV') || process.env.NODE_ENV || '';
        const isTestEnv =
          nodeEnv.toLowerCase() === 'test' ||
          nodeEnv.toLowerCase() === 'testing';
        const limit = isTestEnv ? 10000 : 10;
        return [
          {
            ttl: 60000,
            // Disable throttling in test environment to avoid flaky E2E tests
            limit,
          },
        ];
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PlansModule,
    SubscriptionsModule,
    WebhooksModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
