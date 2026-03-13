import { Controller, Post, Get, Patch, Delete, Body, Param, Req, Res, UseGuards, Header, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsOptional, IsArray, IsEnum, IsIn, ValidateNested, ArrayMinSize, ArrayMaxSize, MaxLength, Allow } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { AgentService } from './agent.service';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';

class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(50_000)
  content: string;
}

class AgentChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsString()
  @IsOptional()
  @MaxLength(500_000)
  csvContent?: string;

  @IsOptional()
  @Allow()
  spreadsheetContext?: {
    selectedRows: Array<{
      id: string;
      type: string;
      description: string;
      member?: string;
      category: string;
      incomeCents: number;
      outstandingCents: number;
      expenseCents: number;
      status?: string;
      unallocatedCents?: number;
    }>;
  };
}

class AgentQueryDto {
  @IsString()
  @MaxLength(1000)
  query: string;

  @IsOptional()
  @Allow()
  viewMetadata?: { typeFilter: string; rowCount: number; columns: string[] };
}

class ConfirmActionDto {
  @IsString()
  toolName: string;

  @Allow()
  args: Record<string, any>;
}

class AgentConfirmDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ConfirmActionDto)
  actions: ConfirmActionDto[];
}

class UpdateSessionDto {
  @IsOptional()
  messages?: any;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;
}

@Controller('organizations/:orgId/agent')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AgentController {
  constructor(private agentService: AgentService) {}

  @Post('chat')
  @Roles('ADMIN', 'TREASURER')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  async chat(
    @Param('orgId') orgId: string,
    @Body() dto: AgentChatDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const actorId = req.membership.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.agentService.chat(orgId, actorId, dto.messages, dto.csvContent, dto.spreadsheetContext)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    }

    res.end();
  }

  @Post('query')
  @Roles('ADMIN', 'TREASURER')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async query(
    @Param('orgId') orgId: string,
    @Body() dto: AgentQueryDto,
  ) {
    return this.agentService.querySpreadsheet(orgId, dto.query, dto.viewMetadata);
  }

  @Post('confirm')
  @Roles('ADMIN', 'TREASURER')
  async confirm(
    @Param('orgId') orgId: string,
    @Body() dto: AgentConfirmDto,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.agentService.confirm(orgId, actorId, dto.actions);
  }

  // ── Session endpoints ─────────────────────────────────────────

  @Post('sessions')
  @Roles('ADMIN', 'TREASURER')
  async createSession(
    @Param('orgId') orgId: string,
    @Req() req: any,
  ) {
    const actorId = req.membership.id;
    return this.agentService.createSession(orgId, actorId);
  }

  @Get('sessions')
  @Roles('ADMIN', 'TREASURER')
  async listSessions(@Param('orgId') orgId: string) {
    return this.agentService.listSessions(orgId);
  }

  @Get('sessions/:sessionId')
  @Roles('ADMIN', 'TREASURER')
  async getSession(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.agentService.getSession(orgId, sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  @Patch('sessions/:sessionId')
  @Roles('ADMIN', 'TREASURER')
  async updateSession(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.agentService.updateSession(orgId, sessionId, dto);
  }

  @Delete('sessions/:sessionId')
  @Roles('ADMIN', 'TREASURER')
  async deleteSession(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
  ) {
    const result = await this.agentService.deleteSession(orgId, sessionId);
    if (!result) throw new NotFoundException('Session not found');
    return { success: true };
  }
}
