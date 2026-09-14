import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

// Callbacks must contain database operations only: a retried attempt rolls back.
export async function serializable<T>(db: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code !== 'P2034') throw error;
      if (attempt === 3) throw new ConflictException('Concurrent financial update; retry the request');
      await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable transaction retry state');
}
