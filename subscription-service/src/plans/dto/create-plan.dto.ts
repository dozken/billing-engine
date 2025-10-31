import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'Basic Plan' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Perfect for getting started' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 9.99 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 'MONTHLY', enum: ['MONTHLY', 'YEARLY'] })
  @IsString()
  billingCycle: string;

  @ApiProperty({ example: ['Feature 1', 'Feature 2'] })
  @IsArray()
  @IsString({ each: true })
  features: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
