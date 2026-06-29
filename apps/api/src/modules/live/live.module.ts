import { Module } from '@nestjs/common';
import { LiveController } from './live.controller';
import { ValkeyService } from '../../services/valkey.service';
import { AuthGuardsModule } from '../../auth/auth-guards.module';

@Module({
  imports: [AuthGuardsModule],
  controllers: [LiveController],
  providers: [ValkeyService],
})
export class LiveModule {}
