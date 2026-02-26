import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuthEventData {
  userId?: string;
  email?: string;
  event: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuthEventService {
  private readonly logger = new Logger(AuthEventService.name);

  constructor(private prisma: PrismaService) {}

  async log(data: AuthEventData) {
    try {
      await this.prisma.authEvent.create({
        data: {
          userId: data.userId,
          email: data.email,
          event: data.event,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          metadata: data.metadata ?? undefined,
        },
      });
    } catch (error) {
      // Best-effort — never break auth flow
      this.logger.error(`Failed to log auth event: ${data.event}`, error);
    }
  }
}
