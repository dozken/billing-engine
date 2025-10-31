import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({ example: 'basic-plan' })
  @IsString()
  planId: string;
}
