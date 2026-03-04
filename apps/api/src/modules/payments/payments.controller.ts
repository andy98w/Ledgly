import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, IsArray, ValidateNested, IsInt, Min, Max, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentsService } from './payments.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreatePaymentDto {
  @IsString()
  @IsOptional()
  membershipId?: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;

  @IsString()
  paidAt: string;

  @IsString()
  @IsOptional()
  rawPayerName?: string;

  @IsString()
  @IsOptional()
  memo?: string;
}

class UpdatePaymentDto {
  @IsString()
  @IsOptional()
  membershipId?: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  @IsOptional()
  amountCents?: number;

  @IsString()
  @IsOptional()
  paidAt?: string;

  @IsString()
  @IsOptional()
  rawPayerName?: string;

  @IsString()
  @IsOptional()
  memo?: string;
}

class AllocationItemDto {
  @IsString()
  chargeId: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;
}

class AllocatePaymentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations: AllocationItemDto[];
}

class BulkCreatePaymentItemDto {
  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;

  @IsString()
  paidAt: string;

  @IsString()
  @IsOptional()
  rawPayerName?: string;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsString()
  @IsOptional()
  membershipId?: string;
}

class BulkCreatePaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkCreatePaymentItemDto)
  payments: BulkCreatePaymentItemDto[];
}

class BulkPaymentIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  paymentIds: string[];
}

class BulkAllocationIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  allocationIds: string[];
}

class PaymentFiltersDto {
  @IsOptional()
  membershipId?: string;

  @IsOptional()
  unallocated?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  cursor?: string;
}

@Controller('organizations/:orgId/payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string, @Query() query: PaymentFiltersDto) {
    return this.paymentsService.findAll(orgId, {
      membershipId: query.membershipId,
      unallocated: query.unallocated ? query.unallocated === 'true' : undefined,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      cursor: query.cursor,
    });
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.paymentsService.findOne(orgId, id);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(@Param('orgId') orgId: string, @Body() dto: CreatePaymentDto, @Req() req: any) {
    const membershipId = req.membership.id;
    return this.paymentsService.create(orgId, membershipId, dto);
  }

  @Post(':id/allocate')
  @Roles('ADMIN', 'TREASURER')
  async allocate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: AllocatePaymentDto,
    @Req() req: any,
  ) {
    const membershipId = req.membership.id;
    return this.paymentsService.allocate(orgId, id, membershipId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TREASURER')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.paymentsService.update(orgId, id, dto, actorId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TREASURER')
  async delete(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.paymentsService.delete(orgId, id, actorId);
  }

  @Post('bulk')
  @Roles('ADMIN', 'TREASURER')
  async bulkCreate(
    @Param('orgId') orgId: string,
    @Body() dto: BulkCreatePaymentDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.paymentsService.bulkCreate(orgId, actorId, dto.payments);
  }

  @Post('bulk-delete')
  @Roles('ADMIN', 'TREASURER')
  async bulkDelete(@Param('orgId') orgId: string, @Body() dto: BulkPaymentIdsDto, @Req() req: any) {
    const actorId = req.membership.id;
    return this.paymentsService.bulkDelete(orgId, dto.paymentIds, actorId);
  }

  @Post('bulk-auto-allocate')
  @Roles('ADMIN', 'TREASURER')
  async bulkAutoAllocate(@Param('orgId') orgId: string, @Body() dto: BulkPaymentIdsDto, @Req() req: any) {
    const actorId = req.membership.id;
    return this.paymentsService.bulkAutoAllocate(orgId, dto.paymentIds, actorId);
  }

  @Post(':id/restore')
  @Roles('ADMIN', 'TREASURER')
  async restore(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.paymentsService.restore(orgId, id, actorId);
  }

  @Delete('allocations/:allocationId')
  @Roles('ADMIN', 'TREASURER')
  async removeAllocation(@Param('orgId') orgId: string, @Param('allocationId') allocationId: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.paymentsService.removeAllocation(orgId, allocationId, actorId);
  }

  @Post('allocations/bulk-remove')
  @Roles('ADMIN', 'TREASURER')
  async bulkRemoveAllocations(
    @Param('orgId') orgId: string,
    @Body() dto: BulkAllocationIdsDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.paymentsService.bulkRemoveAllocations(orgId, dto.allocationIds, actorId);
  }

  @Get('member/:membershipId/unallocated')
  async getUnallocatedForMember(
    @Param('orgId') orgId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.paymentsService.getUnallocatedForMember(orgId, membershipId);
  }

  @Post('auto-allocate/:chargeId')
  @Roles('ADMIN', 'TREASURER')
  async autoAllocateToCharge(
    @Param('orgId') orgId: string,
    @Param('chargeId') chargeId: string,
    @Req() req: any,
  ) {
    const membershipId = req.membership.id;
    return this.paymentsService.autoAllocateToCharge(orgId, chargeId, membershipId);
  }
}
