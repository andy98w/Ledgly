import { Controller, Post, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, IsOptional } from 'class-validator';
import { AuthService } from './auth.service';
import { CurrentUser, CurrentUserData, Public } from '../../common/decorators';

class SendMagicLinkDto {
  @IsEmail()
  email: string;
}

class VerifyMagicLinkDto {
  @IsString()
  token: string;
}

class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('magic-link')
  async sendMagicLink(@Body() dto: SendMagicLinkDto) {
    return this.authService.sendMagicLink(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify')
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto) {
    return this.authService.verifyMagicLink(dto.token);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMe(@CurrentUser() user: CurrentUserData) {
    return this.authService.getAuthUser(user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  async updateProfile(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, dto);
  }

  // Dev-only endpoint to bypass magic link
  @Public()
  @Post('dev-login')
  async devLogin(@Body() dto: SendMagicLinkDto) {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Dev login only available in development');
    }
    return this.authService.devLogin(dto.email);
  }
}
