import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class DowngradeSubscriptionDto {
  @ApiProperty({ example: 'basic-plan' })
  @IsString()
  planId: string;
}
