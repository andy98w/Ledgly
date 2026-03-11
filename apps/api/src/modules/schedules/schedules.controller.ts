import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsEnum, IsOptional, IsInt, Min, Max, IsArray, IsBoolean } from 'class-validator';
import { ChargeCategory, ScheduleFrequency } from '@prisma/client';
import { SchedulesService } from './schedules.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateScheduleDto {
  @IsString()
  title: string;

  @IsEnum(ChargeCategory)
  category: ChargeCategory;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;

  @IsEnum(ScheduleFrequency)
  frequency: ScheduleFrequency;

  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  monthOfYear?: number;

  @IsString()
  @IsOptional()
  targetScope?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetIds?: string[];
}

class UpdateScheduleDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  @IsOptional()
  amountCents?: number;

  @IsEnum(ScheduleFrequency)
  @IsOptional()
  frequency?: ScheduleFrequency;

  @IsInt()
  @Min(1)
  @Max(28)
  @IsOptional()
  dayOfMonth?: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  monthOfYear?: number;

  @IsString()
  @IsOptional()
  targetScope?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetIds?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

@Controller('organizations/:orgId/schedules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SchedulesController {
  constructor(private schedulesService: SchedulesService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.schedulesService.findAll(orgId);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(@Param('orgId') orgId: string, @Body() dto: CreateScheduleDto, @Req() req: any) {
    const membershipId = req.membership.id;
    return this.schedulesService.create(orgId, membershipId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TREASURER')
  async update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedulesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TREASURER')
  async deactivate(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.schedulesService.deactivate(orgId, id);
  }
}
