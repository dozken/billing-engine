import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new plan' })
  @ApiBody({
    description: 'Plan details to create a plan',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Basic Plan' },
        description: {
          type: 'string',
          example: 'Perfect for getting started',
        },
        price: { type: 'number', example: 9.99 },
        billingCycle: { type: 'string', example: 'MONTHLY' },
        features: {
          type: 'array',
          items: { type: 'string' },
          example: ['Feature 1', 'Feature 2'],
        },
        isActive: { type: 'boolean', example: true },
      },
      required: ['name', 'price', 'billingCycle', 'features'],
    },
  })
  create(@Body() createPlanDto: CreatePlanDto) {
    return this.plansService.create(createPlanDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all plans' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.plansService.findAll(activeOnly === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan by ID' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update plan' })
  @ApiBody({
    description: 'Fields to update on the plan',
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Pro Plan' },
        description: { type: 'string', example: 'For growing teams' },
        price: { type: 'number', example: 19.99 },
        billingCycle: { type: 'string', example: 'YEARLY' },
        features: {
          type: 'array',
          items: { type: 'string' },
          example: ['All Basic features', 'Priority support'],
        },
        isActive: { type: 'boolean', example: false },
      },
    },
  })
  update(@Param('id') id: string, @Body() updatePlanDto: UpdatePlanDto) {
    return this.plansService.update(id, updatePlanDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete plan' })
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
