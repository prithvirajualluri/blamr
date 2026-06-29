import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyEntity } from '../entities/api-key.entity';
import { ApiKeyGuard } from './api-key.guard';
import { JwtAuthGuard, JwtOrApiKeyGuard } from './jwt.guard';
import { StreamAuthGuard } from './stream-auth.guard';
import { RolesGuard } from './roles.guard';
import { ValkeyService } from '../services/valkey.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyEntity])],
  providers: [ApiKeyGuard, JwtAuthGuard, JwtOrApiKeyGuard, StreamAuthGuard, RolesGuard, ValkeyService],
  exports: [ApiKeyGuard, JwtAuthGuard, JwtOrApiKeyGuard, StreamAuthGuard, RolesGuard, ValkeyService],
})
export class AuthGuardsModule {}
