import { Controller, Post, Get, Patch, Body, UseGuards, Req, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
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

class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  name: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class ChangePasswordDto {
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

class RefreshDto {
  @IsString()
  refreshToken: string;
}

class LogoutDto {
  @IsString()
  refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.authService.register(dto.email, dto.password, dto.name, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto.email, dto.password, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('magic-link')
  async sendMagicLink(@Body() dto: SendMagicLinkDto) {
    return this.authService.sendMagicLink(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify')
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto, @Req() req: any) {
    return this.authService.verifyMagicLink(dto.token, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Get('invite/:token')
  async resolveInvite(@Param('token') token: string) {
    return this.authService.resolveInviteToken(token);
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

  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch('password')
  async changePassword(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ChangePasswordDto,
    @Req() req: any,
  ) {
    return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.sendPasswordResetEmail(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: any) {
    return this.authService.resetPassword(dto.token, dto.password, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: any) {
    return this.authService.refresh(dto.refreshToken, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('logout')
  async logout(@Body() dto: LogoutDto, @Req() req: any) {
    await this.authService.revokeRefreshToken(dto.refreshToken, req.ip, req.headers['user-agent']);
    return { success: true };
  }

}
