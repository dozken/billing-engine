import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

interface MockPlanDelegate {
  create: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  findMany: jest.Mock<Promise<unknown[]>, [Record<string, unknown>?]>;
  findUnique: jest.Mock<Promise<unknown | null>, [Record<string, unknown>]>;
  update: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  delete: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
}

interface MockPrismaService {
  plan: MockPlanDelegate;
}

describe('PlansService', () => {
  let service: PlansService;
  let prisma: MockPrismaService;

  const mockPlan = {
    id: 'basic-plan',
    name: 'Basic Plan',
    description: 'Basic plan description',
    price: 9.99,
    billingCycle: 'MONTHLY',
    features: ['Feature 1', 'Feature 2'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPlanInactive = {
    ...mockPlan,
    id: 'inactive-plan',
    isActive: false,
  };

  beforeEach(async () => {
    const mockPrisma: MockPrismaService = {
      plan: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PlansService>(PlansService);
    prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a plan successfully', async () => {
      const createDto: CreatePlanDto = {
        name: 'Basic Plan',
        description: 'Basic plan description',
        price: 9.99,
        billingCycle: 'MONTHLY',
        features: ['Feature 1', 'Feature 2'],
        isActive: true,
      };

      prisma.plan.create.mockResolvedValue({
        ...mockPlan,
        price: mockPlan.price,
      });

      const result = await service.create(createDto);

      expect(prisma.plan.create).toHaveBeenCalledWith({
        data: expect.objectContaining(createDto),
      });
      expect(result).toEqual(mockPlan);
    });
  });

  describe('findAll', () => {
    it('should return all plans when activeOnly is false', async () => {
      const plans = [mockPlan, mockPlanInactive];
      prisma.plan.findMany.mockResolvedValue(plans);

      const result = await service.findAll(false);

      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { price: 'asc' },
      });
      expect(result).toEqual(plans);
    });

    it('should return only active plans when activeOnly is true', async () => {
      prisma.plan.findMany.mockResolvedValue([mockPlan]);

      const result = await service.findAll(true);

      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      });
      expect(result).toEqual([mockPlan]);
    });

    it('should default to returning all plans when activeOnly is not provided', async () => {
      const plans = [mockPlan, mockPlanInactive];
      prisma.plan.findMany.mockResolvedValue(plans);

      const result = await service.findAll();

      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { price: 'asc' },
      });
      expect(result).toEqual(plans);
    });
  });

  describe('findOne', () => {
    it('should return a plan when found', async () => {
      prisma.plan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.findOne('basic-plan');

      expect(prisma.plan.findUnique).toHaveBeenCalledWith({
        where: { id: 'basic-plan' },
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw NotFoundException when plan is not found', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne('non-existent')).rejects.toThrow(
        'Plan with ID non-existent not found',
      );
    });
  });

  describe('update', () => {
    it('should update a plan successfully', async () => {
      const updateDto: UpdatePlanDto = {
        name: 'Updated Plan',
        price: 19.99,
      };
      const updatedPlan = { ...mockPlan, ...updateDto };

      prisma.plan.findUnique
        .mockResolvedValueOnce(mockPlan)
        .mockResolvedValueOnce(updatedPlan);
      prisma.plan.update.mockResolvedValue(updatedPlan);

      const result = await service.update('basic-plan', updateDto);

      expect(prisma.plan.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.plan.update).toHaveBeenCalledWith({
        where: { id: 'basic-plan' },
        data: expect.objectContaining(updateDto),
      });
      expect(result).toEqual(updatedPlan);
    });

    it('should throw NotFoundException when plan does not exist', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.plan.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a plan successfully', async () => {
      prisma.plan.delete.mockResolvedValue({});

      await service.remove('basic-plan');

      expect(prisma.plan.delete).toHaveBeenCalledWith({
        where: { id: 'basic-plan' },
      });
    });
  });
});
