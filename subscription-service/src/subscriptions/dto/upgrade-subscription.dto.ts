import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpgradeSubscriptionDto {
  @ApiProperty({ example: 'pro-plan' })
  @IsString()
  planId: string;
}
