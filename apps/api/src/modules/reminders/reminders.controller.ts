import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, IsInt, Min, Max, IsBoolean, IsIn } from 'class-validator';
import { RemindersService } from './reminders.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateReminderRuleDto {
  @IsString()
  @IsIn(['BEFORE_DUE', 'AFTER_DUE'])
  triggerType: string;

  @IsInt()
  @Min(1)
  @Max(90)
  daysOffset: number;
}

class UpdateReminderRuleDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  daysOffset?: number;
}

@Controller('organizations/:orgId/reminders/rules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class RemindersController {
  constructor(private remindersService: RemindersService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string) {
    return this.remindersService.findAllRules(orgId);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(@Param('orgId') orgId: string, @Body() dto: CreateReminderRuleDto) {
    return this.remindersService.createRule(orgId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TREASURER')
  async update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: UpdateReminderRuleDto) {
    return this.remindersService.updateRule(orgId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TREASURER')
  async delete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.remindersService.deleteRule(orgId, id);
  }
}
