import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
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
    const webUrl = this.configService.get<string>('WEB_URL', 'http://localhost:3000');
    const magicLink = `${webUrl}/verify?token=${token}`;

    // Log magic link in development for testing
    if (this.configService.get<string>('NODE_ENV') === 'development') {
      console.log('\n========================================');
      console.log('MAGIC LINK (dev only):');
      console.log(magicLink);
      console.log('========================================\n');
    }

    await this.emailService.sendMagicLink(normalizedEmail, magicLink);

    return { message: 'Magic link sent to your email' };
  }

  async verifyMagicLink(token: string): Promise<{ accessToken: string; user: any }> {
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

    // Generate JWT
    const payload = {
      sub: magicToken.user.id,
      email: magicToken.user.email,
    };
    const accessToken = this.jwtService.sign(payload);

    // Get user with memberships
    const user = await this.getAuthUser(magicToken.user.id);

    return { accessToken, user };
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
      memberships: user.memberships.map((m) => ({
        id: m.id,
        orgId: m.org.id,
        orgName: m.org.name,
        role: m.role,
        status: m.status,
      })),
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

  // Dev-only: bypass magic link
  async devLogin(email: string): Promise<{ accessToken: string; user: any }> {
    const normalizedEmail = email.toLowerCase().trim();

    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { email: normalizedEmail, name: email.split('@')[0] },
      });
    }

    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);
    const authUser = await this.getAuthUser(user.id);

    return { accessToken, user: authUser };
  }
}
