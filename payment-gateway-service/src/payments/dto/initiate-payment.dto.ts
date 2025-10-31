import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsUrl } from 'class-validator';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'subscription-123' })
  @IsString()
  subscriptionId: string;

  @ApiProperty({ example: 29.99 })
  @IsNumber()
  amount: number;

  @ApiProperty({
    example: 'http://subscription-service:3000/webhooks/payment',
  })
  @IsUrl({ require_tld: false })
  webhookUrl: string;
}
