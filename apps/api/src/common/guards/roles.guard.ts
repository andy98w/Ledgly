import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgId = request.params.orgId;

    if (!user || !orgId) {
      return false;
    }

    // Skip DB query if membership was already resolved by a prior guard
    const existing = request.membership;
    if (existing && existing.orgId === orgId && existing.userId === user.userId && existing.status === 'ACTIVE') {
      const effectiveRoles: MembershipRole[] = existing.role === 'OWNER'
        ? ['OWNER', 'ADMIN']
        : [existing.role];
      return requiredRoles.some(r => effectiveRoles.includes(r));
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        orgId,
        userId: user.userId,
        status: 'ACTIVE',
      },
    });

    if (!membership) {
      return false;
    }

    // Attach membership to request for use in controllers
    request.membership = membership;

    // OWNER implicitly has ADMIN privileges
    const effectiveRoles: MembershipRole[] = membership.role === 'OWNER'
      ? ['OWNER', 'ADMIN']
      : [membership.role];
    return requiredRoles.some(r => effectiveRoles.includes(r));
  }
}
