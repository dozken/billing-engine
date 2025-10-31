import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<{ access_token: string }> {
    try {
      const user = await this.usersService.findByEmail(loginDto.email);

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.password,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const payload = { sub: user.id, email: user.email };
      return {
        access_token: this.jwtService.sign(payload),
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async register(registerDto: RegisterDto): Promise<{ id: string }> {
    try {
      const existing = await this.usersService.findByEmail(registerDto.email);
      if (existing) {
        throw new ConflictException('Email already exists');
      }
      const created = await this.usersService.create({
        email: registerDto.email,
        name: registerDto.name,
        password: registerDto.password,
      });
      return { id: created.id };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async validateUser(
    userId: string,
  ): Promise<import('../users/users.service').PublicUser | null> {
    try {
      return await this.usersService.findOne(userId);
    } catch {
      return null;
    }
  }
}
