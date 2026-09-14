import { Controller, Get, Post, Param, Req, UseGuards, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('organizations/:orgId/jobs')
@UseGuards(AuthGuard('jwt'),RolesGuard)
@Roles('ADMIN','TREASURER')
export class JobsController {
  constructor(private db:PrismaService) {}
  @Get()
  async list(@Param('orgId') orgId:string) {
    // No provider payloads or credentials in the operational view.
    return this.db.durableJob.findMany({where:{orgId,kind:{in:['gmail-scan','gmail-message','notification']}},select:{id:true,kind:true,status:true,attempts:true,createdAt:true,updatedAt:true,availableAt:true,leaseUntil:true},orderBy:{createdAt:'desc'},take:100});
  }
  @Get('health')
  async health(@Param('orgId') orgId:string) {
    const where={orgId,kind:{in:['gmail-scan','gmail-message','notification']}};
    const [counts,oldest]=await Promise.all([
      this.db.durableJob.groupBy({by:['kind','status'],where,_count:true}),
      this.db.durableJob.findFirst({where:{...where,status:{in:['pending','running']}},orderBy:{createdAt:'asc'},select:{createdAt:true}}),
    ]);
    return {counts,oldestPendingAgeSeconds:oldest?Math.max(0,Math.floor((Date.now()-oldest.createdAt.getTime())/1000)):0};
  }
  @Post(':id/replay')
  async replay(@Param('orgId') orgId:string,@Param('id') id:string,@Req() req:any) {
    return this.db.$transaction(async tx=>{
      const updated=await tx.durableJob.updateMany({where:{id,orgId,status:'failed',kind:{in:['gmail-scan','gmail-message','notification']}},data:{status:'pending',attempts:0,availableAt:new Date(),updatedAt:new Date()}});
      if (!updated.count) throw new NotFoundException('Failed job not found');
      await tx.auditLog.create({data:{orgId,actorId:req.membership.id,entityType:'JOB',entityId:id,action:'REPLAY'}});
      return {replayed:true};
    });
  }
}
