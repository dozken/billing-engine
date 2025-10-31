import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PaymentStatus, PaymentTransaction } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import type { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly maxRetries = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async initiatePayment(dto: InitiatePaymentDto): Promise<{
    paymentId: string;
    status: PaymentStatus;
    message: string;
  }> {
    const forceSuccessEnv: string = this.configService.get<string>(
      'FORCE_PAYMENT_SUCCESS',
      'false',
    );
    const forceSuccess: boolean = forceSuccessEnv === 'true';
    const isSuccess: boolean = forceSuccess ? true : Math.random() > 0.2;
    const status: PaymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';

    this.logger.log(
      `Processing payment for subscription ${dto.subscriptionId}: ${status}`,
    );

    const transaction = await this.prisma.paymentTransaction.create({
      data: {
        subscriptionId: dto.subscriptionId,
        amount: Number(dto.amount),
        status,
        webhookUrl: dto.webhookUrl,
      },
    });

    this.sendWebhookWithRetry(transaction.id, {
      subscriptionId: dto.subscriptionId,
      paymentId: transaction.id,
      success: isSuccess,
    });

    return {
      paymentId: transaction.id,
      status,
      message: isSuccess ? 'Payment processed successfully' : 'Payment failed',
    };
  }

  private async sendWebhookWithRetry(
    transactionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      this.logger.error(`Transaction ${transactionId} not found`);
      return;
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(
          `Sending webhook attempt ${attempt}/${this.maxRetries} for transaction ${transactionId}`,
        );

        await firstValueFrom(
          this.httpService.post(transaction.webhookUrl, payload, {
            timeout: 5000,
          }),
        );

        await this.prisma.paymentTransaction.update({
          where: { id: transactionId },
          data: {
            attempts: attempt,
            response: 'Webhook delivered successfully',
          },
        });

        this.logger.log(
          `Webhook delivered successfully for transaction ${transactionId}`,
        );
        return;
      } catch (error) {
        this.logger.error(
          `Webhook attempt ${attempt} failed for transaction ${transactionId}: ${error.message}`,
        );

        await this.prisma.paymentTransaction.update({
          where: { id: transactionId },
          data: {
            attempts: attempt,
            response: `Attempt ${attempt} failed: ${error.message}`,
          },
        });

        if (attempt < this.maxRetries) {
          await this.delay(attempt * 1000);
        }
      }
    }

    this.logger.error(
      `Failed to deliver webhook after ${this.maxRetries} attempts for transaction ${transactionId}`,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getTransaction(id: string): Promise<PaymentTransaction> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async getAllTransactions(): Promise<PaymentTransaction[]> {
    try {
      const items = await this.prisma.paymentTransaction.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return items;
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to retrieve transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
