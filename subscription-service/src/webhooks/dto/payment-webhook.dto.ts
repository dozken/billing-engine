import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class PaymentWebhookDto {
  @ApiProperty({ example: 'sub_123456' })
  @IsString()
  subscriptionId: string;

  @ApiProperty({ example: 'pay_987654' })
  @IsString()
  paymentId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  success: boolean;
}
