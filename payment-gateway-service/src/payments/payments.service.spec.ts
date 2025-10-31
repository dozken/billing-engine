import { HttpService } from '@nestjs/axios';
import { Logger, NotFoundException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Observable, of, throwError } from 'rxjs';
import {
  PaymentStatus,
  PaymentTransaction,
  Prisma,
} from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import type { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { PaymentsService } from './payments.service';

jest.useFakeTimers();

interface MockPaymentTransactionDelegate {
  create: jest.Mock<
    Promise<PaymentTransaction>,
    [
      {
        data: {
          subscriptionId: string;
          amount: number;
          status: PaymentStatus;
          webhookUrl: string;
        };
      },
    ]
  >;
  findUnique: jest.Mock<
    Promise<PaymentTransaction | null>,
    [{ where: { id: string } }]
  >;
  findMany: jest.Mock<
    Promise<PaymentTransaction[]>,
    [{ orderBy: { createdAt: 'desc' } }?]
  >;
  update: jest.Mock<
    Promise<PaymentTransaction>,
    [{ where: { id: string }; data: { attempts: number; response: string } }]
  >;
}

interface MockPrismaService {
  paymentTransaction: MockPaymentTransactionDelegate;
}

interface MockHttpService {
  post: jest.Mock<Observable<unknown>, [string, unknown, { timeout: number }]>;
}

interface MockConfigService {
  get: jest.Mock<string, [string, string?]>;
}

// Helper functions to reduce duplication
function makeDto(overrides?: Partial<InitiatePaymentDto>): InitiatePaymentDto {
  return {
    subscriptionId: 'subscription-id',
    amount: 29.99,
    webhookUrl: 'http://example.com/webhook',
    ...overrides,
  };
}

function makeTransaction(
  overrides?: Partial<PaymentTransaction>,
): PaymentTransaction {
  const now = new Date();
  return {
    id: 'transaction-id',
    subscriptionId: 'subscription-id',
    amount: new Prisma.Decimal(29.99),
    status: 'SUCCESS',
    webhookUrl: 'http://example.com/webhook',
    attempts: 0,
    response: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaService: MockPrismaService;
  let httpService: MockHttpService;
  let configService: MockConfigService;

  const mockTransaction = makeTransaction();

  beforeEach(async () => {
    const mockPrismaService: MockPrismaService = {
      paymentTransaction: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockHttpService: MockHttpService = {
      post: jest.fn(),
    };

    const mockConfigService: MockConfigService = {
      get: jest.fn().mockReturnValue('false'),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({})],
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prismaService = mockPrismaService;
    httpService = mockHttpService;
    configService = mockConfigService;
  });

  beforeAll((): void => {
    // Disable Nest logger output for test runs
    Logger.overrideLogger(false);
  });

  afterAll((): void => {
    // Re-enable default logger behavior after tests
    Logger.overrideLogger(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiatePayment', () => {
    beforeEach(() => {
      // Mock the async webhook call since we're not testing it in initiatePayment tests
      jest
        .spyOn(
          service as unknown as {
            sendWebhookWithRetry: (
              id: string,
              payload: Record<string, unknown>,
            ) => Promise<void>;
          },
          'sendWebhookWithRetry',
        )
        .mockResolvedValue();
    });

    it.each`
      rnd    | expectedStatus | expectedMessage
      ${0.9} | ${'SUCCESS'}   | ${'Payment processed successfully'}
      ${0.1} | ${'FAILED'}    | ${'Payment failed'}
    `(
      'creates transaction with status $expectedStatus (Math.random=$rnd)',
      async ({
        rnd,
        expectedStatus,
        expectedMessage,
      }: {
        rnd: number;
        expectedStatus: PaymentStatus;
        expectedMessage: string;
      }) => {
        jest.spyOn(Math, 'random').mockReturnValue(rnd);
        const dto = makeDto();
        const createdTransaction = makeTransaction({ status: expectedStatus });

        prismaService.paymentTransaction.create.mockResolvedValue(
          createdTransaction,
        );

        const result = await service.initiatePayment(dto);

        expect(prismaService.paymentTransaction.create).toHaveBeenCalledWith({
          data: {
            subscriptionId: dto.subscriptionId,
            amount: dto.amount,
            status: expectedStatus,
            webhookUrl: dto.webhookUrl,
          },
        });
        expect(result.status).toBe(expectedStatus);
        expect(result.message).toBe(expectedMessage);
        expect(result.paymentId).toBe(mockTransaction.id);
      },
    );

    it('forces success when FORCE_PAYMENT_SUCCESS=true', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'FORCE_PAYMENT_SUCCESS' ? 'true' : 'false',
      );
      jest.spyOn(Math, 'random').mockReturnValue(0.1); // Would normally fail
      const dto = makeDto();
      const createdTransaction = makeTransaction({ status: 'SUCCESS' });

      prismaService.paymentTransaction.create.mockResolvedValue(
        createdTransaction,
      );

      const result = await service.initiatePayment(dto);

      expect(result.status).toBe('SUCCESS');
      expect(result.message).toBe('Payment processed successfully');
    });
  });

  describe('sendWebhookWithRetry (private method)', () => {
    const transactionId = 'transaction-id';
    const payload = {
      subscriptionId: 'subscription-id',
      paymentId: transactionId,
      success: true,
    };

    const getSendWebhookMethod = (): ((
      id: string,
      payload: Record<string, unknown>,
    ) => Promise<void>) => {
      return (
        service as unknown as {
          sendWebhookWithRetry: (
            id: string,
            payload: Record<string, unknown>,
          ) => Promise<void>;
        }
      ).sendWebhookWithRetry.bind(service);
    };

    beforeEach(() => {
      prismaService.paymentTransaction.findUnique.mockResolvedValue(
        mockTransaction,
      );
      prismaService.paymentTransaction.update.mockResolvedValue(
        mockTransaction,
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should send webhook successfully on first attempt', async () => {
      httpService.post.mockReturnValue(of({}));

      const sendWebhookMethod = getSendWebhookMethod();
      await sendWebhookMethod(transactionId, payload);

      expect(prismaService.paymentTransaction.findUnique).toHaveBeenCalledWith({
        where: { id: transactionId },
      });
      expect(httpService.post).toHaveBeenCalledWith(
        mockTransaction.webhookUrl,
        payload,
        { timeout: 5000 },
      );
      expect(prismaService.paymentTransaction.update).toHaveBeenCalledWith({
        where: { id: transactionId },
        data: {
          attempts: 1,
          response: 'Webhook delivered successfully',
        },
      });
    });

    it('should retry webhook on failure and eventually succeed', async () => {
      let attemptCount = 0;
      httpService.post.mockImplementation(() => {
        attemptCount++;
        return attemptCount < 2
          ? throwError(() => new Error('Network error'))
          : of({});
      });

      const sendWebhookMethod = getSendWebhookMethod();
      const promise = sendWebhookMethod(transactionId, payload);
      await jest.runAllTimersAsync();
      await promise;

      expect(httpService.post).toHaveBeenCalledTimes(2);
      expect(prismaService.paymentTransaction.update).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries (3 attempts)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const sendWebhookMethod = getSendWebhookMethod();
      const promise = sendWebhookMethod(transactionId, payload);
      await jest.runAllTimersAsync();
      await promise;

      expect(httpService.post).toHaveBeenCalledTimes(3);
      expect(prismaService.paymentTransaction.update).toHaveBeenCalledTimes(3);
    });

    it('should not send webhook if transaction not found', async () => {
      prismaService.paymentTransaction.findUnique.mockResolvedValue(null);

      const sendWebhookMethod = getSendWebhookMethod();
      await sendWebhookMethod(transactionId, payload);

      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  describe('getTransaction', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return transaction when found', async () => {
      prismaService.paymentTransaction.findUnique.mockResolvedValue(
        mockTransaction,
      );

      const result = await service.getTransaction('transaction-id');

      expect(prismaService.paymentTransaction.findUnique).toHaveBeenCalledWith({
        where: { id: 'transaction-id' },
      });
      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException when transaction not found', async () => {
      prismaService.paymentTransaction.findUnique.mockResolvedValue(null);

      await expect(service.getTransaction('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllTransactions', () => {
    it('should return all transactions ordered by createdAt desc', async () => {
      const transactions = [
        mockTransaction,
        makeTransaction({ id: 'transaction-2' }),
      ];
      prismaService.paymentTransaction.findMany.mockResolvedValue(transactions);

      const result = await service.getAllTransactions();

      expect(prismaService.paymentTransaction.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(transactions);
    });
  });
});
