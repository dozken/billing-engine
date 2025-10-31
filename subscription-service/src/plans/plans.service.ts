import type { Plan } from '@generated/prisma';
import { Prisma } from '@generated/prisma';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPlanDto: CreatePlanDto): Promise<Plan> {
    return this.prisma.plan.create({
      data: {
        ...createPlanDto,
        description: createPlanDto.description ?? null,
        isActive: createPlanDto.isActive ?? true,
      },
    });
  }

  async findAll(activeOnly = false): Promise<Plan[]> {
    const plans = await this.prisma.plan.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { price: 'asc' },
    });
    return plans;
  }

  async findOne(id: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan with ID ${id} not found`);
    return plan;
  }

  async update(id: string, updatePlanDto: UpdatePlanDto): Promise<Plan> {
    await this.findOne(id);
    return this.prisma.plan.update({
      where: { id },
      data: this.buildUpdateData(updatePlanDto),
    });
  }
  private buildUpdateData(
    updatePlanDto: UpdatePlanDto,
  ): Prisma.PlanUpdateInput {
    const data: Prisma.PlanUpdateInput = {};

    if (updatePlanDto.name !== undefined) {
      data.name = updatePlanDto.name;
    }
    if ('description' in updatePlanDto) {
      data.description = updatePlanDto.description ?? null;
    }
    if (updatePlanDto.billingCycle !== undefined) {
      data.billingCycle = updatePlanDto.billingCycle;
    }
    if (updatePlanDto.features !== undefined) {
      data.features = updatePlanDto.features;
    }
    if (updatePlanDto.isActive !== undefined) {
      data.isActive = updatePlanDto.isActive;
    }
    if (updatePlanDto.price !== undefined) {
      data.price = updatePlanDto.price;
    }

    return data;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.plan.delete({ where: { id } });
  }
}
