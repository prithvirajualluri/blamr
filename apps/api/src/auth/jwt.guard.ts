import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiKeyGuard } from './api-key.guard';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.substring(7);
    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      request.userId = payload.sub;
      request.workspaceId = payload.workspace_id;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}

@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
  constructor(
    private readonly jwtGuard: JwtAuthGuard,
    private readonly apiKeyGuard: ApiKeyGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (request.headers.authorization?.startsWith('Bearer ')) {
      return this.jwtGuard.canActivate(context);
    }
    if (request.headers['x-api-key']) {
      return this.apiKeyGuard.canActivate(context);
    }
    throw new UnauthorizedException('Authentication required');
  }
}
