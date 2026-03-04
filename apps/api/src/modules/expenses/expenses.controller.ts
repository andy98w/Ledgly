import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, IsOptional, IsInt, Min, Max, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ExpensesService } from './expenses.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class CreateExpenseDto {
  @IsString()
  category: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  amountCents: number;

  @IsString()
  date: string;

  @IsString()
  @IsOptional()
  vendor?: string;

  @IsString()
  @IsOptional()
  receiptUrl?: string;
}

class UpdateExpenseDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(99_999_999)
  @IsOptional()
  amountCents?: number;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  vendor?: string;

  @IsString()
  @IsOptional()
  receiptUrl?: string;
}

class BulkExpenseIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  expenseIds: string[];
}

class ExpenseFiltersDto {
  @IsOptional()
  category?: string;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;
}

@Controller('organizations/:orgId/expenses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ExpensesController {
  constructor(private expensesService: ExpensesService) {}

  @Get()
  async findAll(@Param('orgId') orgId: string, @Query() query: ExpenseFiltersDto) {
    return this.expensesService.findAll(orgId, {
      category: query.category,
      startDate: query.startDate,
      endDate: query.endDate,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });
  }

  @Get('summary')
  async getSummary(
    @Param('orgId') orgId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.getSummary(orgId, startDate, endDate);
  }

  @Get(':id')
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.expensesService.findOne(orgId, id);
  }

  @Post()
  @Roles('ADMIN', 'TREASURER')
  async create(@Param('orgId') orgId: string, @Body() dto: CreateExpenseDto, @Req() req: any) {
    const membershipId = req.membership.id;
    return this.expensesService.create(orgId, membershipId, dto);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TREASURER')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.expensesService.update(orgId, id, dto, actorId);
  }

  @Delete(':id')
  @Roles('ADMIN', 'TREASURER')
  async delete(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.expensesService.delete(orgId, id, actorId);
  }

  @Post('bulk-delete')
  @Roles('ADMIN', 'TREASURER')
  async bulkDelete(@Param('orgId') orgId: string, @Body() dto: BulkExpenseIdsDto, @Req() req: any) {
    const actorId = req.membership.id;
    return this.expensesService.bulkDelete(orgId, dto.expenseIds, actorId);
  }

  @Post(':id/restore')
  @Roles('ADMIN', 'TREASURER')
  async restore(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const actorId = req.membership.id;
    return this.expensesService.restore(orgId, id, actorId);
  }
}
