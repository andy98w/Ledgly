import { Module } from '@nestjs/common';
import { GroupMeController } from './groupme.controller';
import { GroupMeService } from './groupme.service';

@Module({
  controllers: [GroupMeController],
  providers: [GroupMeService],
  exports: [GroupMeService],
})
export class GroupMeModule {}
