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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { DowngradeSubscriptionDto } from './dto/downgrade-subscription.dto';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new subscription' })
  @ApiResponse({
    status: 201,
    description: 'Subscription created successfully',
  })
  @ApiBody({
    description: 'Payload to create a subscription',
    schema: {
      type: 'object',
      properties: {
        planId: { type: 'string', example: 'basic-plan' },
      },
      required: ['planId'],
    },
  })
  create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.subscriptionsService.create(createSubscriptionDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all subscriptions' })
  findAll(@Query('userId') userId?: string) {
    return this.subscriptionsService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subscription by ID' })
  @ApiResponse({ status: 200, description: 'Subscription found' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }

  @Patch(':id/upgrade')
  @ApiOperation({ summary: 'Upgrade subscription' })
  @ApiResponse({ status: 200, description: 'Subscription upgraded' })
  @ApiResponse({ status: 400, description: 'Cannot upgrade' })
  @ApiBody({
    description: 'New plan for upgrade',
    schema: {
      type: 'object',
      properties: {
        planId: { type: 'string', example: 'pro-plan' },
      },
      required: ['planId'],
    },
  })
  upgrade(@Param('id') id: string, @Body() upgradeDto: UpgradeSubscriptionDto) {
    return this.subscriptionsService.upgrade(id, upgradeDto.planId);
  }

  @Patch(':id/downgrade')
  @ApiOperation({ summary: 'Downgrade subscription' })
  @ApiResponse({ status: 200, description: 'Subscription downgraded' })
  @ApiResponse({ status: 400, description: 'Cannot downgrade' })
  @ApiBody({
    description: 'New plan for downgrade',
    schema: {
      type: 'object',
      properties: {
        planId: { type: 'string', example: 'basic-plan' },
      },
      required: ['planId'],
    },
  })
  downgrade(
    @Param('id') id: string,
    @Body() downgradeDto: DowngradeSubscriptionDto,
  ) {
    return this.subscriptionsService.downgrade(id, downgradeDto.planId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({ status: 200, description: 'Subscription cancelled' })
  cancel(@Param('id') id: string) {
    return this.subscriptionsService.cancel(id);
  }
}
