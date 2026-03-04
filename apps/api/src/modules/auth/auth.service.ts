import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { AuthEventService } from './auth-event.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private authEvents: AuthEventService,
  ) {}

  async sendMagicLink(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { email: normalizedEmail },
      });
    }

    // Generate token
    const token = randomBytes(32).toString('hex');
    const expiresInMinutes = parseInt(
      this.configService.get<string>('MAGIC_LINK_EXPIRES_IN', '15m').replace('m', ''),
      10,
    );
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Save token
    await this.prisma.magicToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Send email
    const webUrl = this.configService.get<string>('WEB_URL');
    const magicLink = `${webUrl}/verify?token=${token}`;

    await this.emailService.sendMagicLink(normalizedEmail, magicLink);

    return { message: 'Magic link sent to your email' };
  }

  async verifyMagicLink(token: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const magicToken = await this.prisma.magicToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!magicToken) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (magicToken.usedAt) {
      throw new UnauthorizedException('Token has already been used');
    }

    if (magicToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token has expired');
    }

    // Mark token as used
    await this.prisma.magicToken.update({
      where: { id: magicToken.id },
      data: { usedAt: new Date() },
    });

    // Reset lockout on successful magic link sign-in
    if (magicToken.user.failedLoginAttempts > 0 || magicToken.user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: magicToken.user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Link pending invitations
    await this.linkPendingInvitations(magicToken.user.email, magicToken.user.id);

    // Generate token pair
    const tokens = await this.generateTokenPair(magicToken.user);
    const user = await this.getAuthUser(magicToken.user.id);

    this.authEvents.log({ userId: magicToken.user.id, email: magicToken.user.email, event: 'MAGIC_LINK_VERIFY', ipAddress: ip, userAgent });

    return { ...tokens, user };
  }

  async getAuthUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          include: {
            org: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hasPassword: !!user.passwordHash,
      memberships: user.memberships.map((m) => ({
        id: m.id,
        orgId: m.org.id,
        orgName: m.org.name,
        role: m.role,
        status: m.status,
      })),
    };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    return token;
  }

  private async generateTokenPair(user: { id: string; email: string }) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  async refresh(refreshTokenValue: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { token: refreshTokenValue },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Detect reuse of revoked token — revoke all tokens for this user
    if (existing.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected. All sessions revoked.');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: revoke old, create new pair
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokenPair(existing.user);
    const authUser = await this.getAuthUser(existing.userId);

    this.authEvents.log({ userId: existing.userId, event: 'TOKEN_REFRESH', ipAddress: ip, userAgent });

    return { ...tokens, user: authUser };
  }

  async revokeRefreshToken(refreshTokenValue: string, ip?: string, userAgent?: string) {
    // Look up the token to get userId for logging
    const rt = await this.prisma.refreshToken.findUnique({ where: { token: refreshTokenValue } });
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshTokenValue, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rt) {
      this.authEvents.log({ userId: rt.userId, event: 'LOGOUT', ipAddress: ip, userAgent });
    }
  }

  async resolveInviteToken(token: string): Promise<{ email: string; orgName: string; memberName: string | null }> {
    const membership = await this.prisma.membership.findFirst({
      where: { inviteToken: token, status: 'INVITED' },
      include: {
        org: { select: { name: true } },
      },
    });

    if (!membership) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    if (membership.inviteExpiresAt && membership.inviteExpiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    return {
      email: membership.invitedEmail!,
      orgName: membership.org.name,
      memberName: membership.name,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    return user;
  }

  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        avatarUrl: data.avatarUrl,
      },
    });

    return this.getAuthUser(userId);
  }

  private validatePasswordStrength(password: string) {
    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestException('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      throw new BadRequestException('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      throw new BadRequestException('Password must contain at least one number');
    }
  }

  async register(email: string, password: string, name: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    this.validatePasswordStrength(password);

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing?.passwordHash) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    if (existing) {
      // User exists from magic-link flow but has no password — set it
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, name: existing.name || name },
      });
    } else {
      user = await this.prisma.user.create({
        data: { email: normalizedEmail, passwordHash, name },
      });
    }

    // Link pending invitations
    await this.linkPendingInvitations(normalizedEmail, user.id);

    const tokens = await this.generateTokenPair(user);
    const authUser = await this.getAuthUser(user.id);

    this.authEvents.log({ userId: user.id, email: user.email, event: 'REGISTER', ipAddress: ip, userAgent });

    return { ...tokens, user: authUser };
  }

  private async linkPendingInvitations(email: string, userId: string) {
    const invited = await this.prisma.membership.findMany({
      where: { invitedEmail: email, status: 'INVITED' },
    });
    for (const m of invited) {
      if (m.inviteExpiresAt && m.inviteExpiresAt < new Date()) continue; // skip expired
      await this.prisma.membership.update({
        where: { id: m.id },
        data: {
          userId,
          status: 'ACTIVE',
          invitedEmail: null,
          inviteExpiresAt: null,
          joinedAt: new Date(),
        },
      });
    }
  }

  async login(email: string, password: string, ip?: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses magic link sign-in. Check your email or set a password.');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMs = user.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw new UnauthorizedException(
        `Account is locked. Try again in ${remainingMin} minute${remainingMin !== 1 ? 's' : ''}.`,
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const updateData: any = { failedLoginAttempts: attempts };

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        this.authEvents.log({ userId: user.id, email: normalizedEmail, event: 'ACCOUNT_LOCKED', ipAddress: ip, userAgent, metadata: { attempts } });
        throw new UnauthorizedException('Account locked due to too many failed attempts. Try again in 15 minutes.');
      }

      this.authEvents.log({ userId: user.id, email: normalizedEmail, event: 'FAILED_LOGIN', ipAddress: ip, userAgent, metadata: { attempts } });
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset lockout on success
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    const tokens = await this.generateTokenPair(user);
    const authUser = await this.getAuthUser(user.id);

    this.authEvents.log({ userId: user.id, email: normalizedEmail, event: 'LOGIN', ipAddress: ip, userAgent });

    return { ...tokens, user: authUser };
  }

  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // If user has a password, verify the current one
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    this.validatePasswordStrength(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke all refresh tokens (force re-login on other devices)
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.authEvents.log({ userId, email: user.email, event: 'PASSWORD_CHANGED', ipAddress: ip, userAgent });

    return { message: 'Password updated successfully' };
  }

  async sendPasswordResetEmail(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If an account exists, a reset link has been sent' };
    }

    // Per-email rate limit: max 3 reset tokens per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentResets = await this.prisma.magicToken.count({
      where: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentResets >= 3) {
      // Silently skip to prevent enumeration
      return { message: 'If an account exists, a reset link has been sent' };
    }

    // Generate token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.prisma.magicToken.create({
      data: {
        token,
        userId: user.id,
        type: 'PASSWORD_RESET',
        expiresAt,
      },
    });

    const webUrl = this.configService.get<string>('WEB_URL');
    const resetLink = `${webUrl}/reset-password?token=${token}`;

    await this.emailService.sendPasswordResetEmail(normalizedEmail, resetLink);

    return { message: 'If an account exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string, ip?: string, userAgent?: string): Promise<{ message: string }> {
    const magicToken = await this.prisma.magicToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!magicToken || magicToken.type !== 'PASSWORD_RESET') {
      throw new BadRequestException('Invalid or expired reset link');
    }

    if (magicToken.usedAt) {
      throw new BadRequestException('This reset link has already been used');
    }

    if (magicToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired');
    }

    this.validatePasswordStrength(newPassword);

    // Mark token as used
    await this.prisma.magicToken.update({
      where: { id: magicToken.id },
      data: { usedAt: new Date() },
    });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: magicToken.user.id },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    });

    // Revoke all refresh tokens (force re-login everywhere)
    await this.prisma.refreshToken.updateMany({
      where: { userId: magicToken.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.authEvents.log({ userId: magicToken.user.id, email: magicToken.user.email, event: 'PASSWORD_RESET', ipAddress: ip, userAgent });

    return { message: 'Password has been reset successfully' };
  }
}
