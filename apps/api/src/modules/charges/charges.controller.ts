import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsArray, IsEnum, IsOptional, IsInt, Min, Max, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ChargeCategory, ChargeStatus } from '@prisma/client';
import { ChargesService } from './charges.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateChargeDto {
  @IsArray()
  @IsString({ each: true })
  membershipIds: string[];

  @IsEnum(ChargeCategory)
  category: ChargeCategory;

  @IsString()
  title: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;

  @IsString()
  @IsOptional()
  dueDate?: string;
}

class UpdateChargeDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  @IsOptional()
  amountCents?: number;

  @IsString()
  @IsOptional()
  dueDate?: string;

  @IsEnum(ChargeStatus)
  @IsOptional()
  status?: ChargeStatus;
}

class BulkCreateChargeItemDto {
  @IsString()
  membershipId: string;

  @IsEnum(ChargeCategory)
  category: ChargeCategory;

  @IsString()
  title: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;

  @IsString()
  @IsOptional()
  dueDate?: string;
}

class BulkCreateChargeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateChargeItemDto)
  charges: BulkCreateChargeItemDto[];
}

class BulkChargeIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  chargeIds: string[];
}

class ChargeFiltersDto {
  @IsOptional()
  status?: ChargeStatus;

  @IsOptional()
  category?: ChargeCategory;

  @IsOptional()
  membershipId?: string;

  @IsOptional()
  overdue?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  cursor?: string;
}

@Controller('organizations/:orgId/charges')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ChargesController {
  constructor(private chargesService: ChargesService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string, @Query() query: ChargeFiltersDto) {
    return this.chargesService.findAll(orgId, {
      status: query.status,
      category: query.category,
      membershipId: query.membershipId,
      overdue: query.overdue ? query.overdue === 'true' : undefined,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      cursor: query.cursor,
    });
  }

  @Post('bulk-create')
  @Roles('ADMIN', 'TREASURER')
  async bulkCreate(@Param('orgId') orgId: string, @Body() dto: BulkCreateChargeDto, @Req() req: any) {
    const membershipId = req.membership.id;
    return this.chargesService.bulkCreate(orgId, membershipId, dto.charges);
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.chargesService.findOne(orgId, id);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(@Param('orgId') orgId: string, @Body() dto: CreateChargeDto, @Req() req: any) {
    const membershipId = req.membership.id;
    return this.chargesService.create(orgId, membershipId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TREASURER')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChargeDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.chargesService.update(orgId, id, dto, actorId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TREASURER')
  async void(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.chargesService.void(orgId, id, actorId);
  }

  @Post('bulk-void')
  @Roles('ADMIN', 'TREASURER')
  async bulkVoid(@Param('orgId') orgId: string, @Body() dto: BulkChargeIdsDto, @Req() req: any) {
    const actorId = req.membership.id;
    return this.chargesService.bulkVoid(orgId, dto.chargeIds, actorId);
  }

  @Post(':id/restore')
  @Roles('ADMIN', 'TREASURER')
  async restore(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.chargesService.restore(orgId, id, actorId);
  }

  @Post('remind')
  @Roles('ADMIN', 'TREASURER')
  async sendReminders(@Param('orgId') orgId: string, @Body() dto: BulkChargeIdsDto) {
    return this.chargesService.sendReminders(orgId, dto.chargeIds);
  }
}
