import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** SSE/EventSource auth via ?token= or Authorization header. */
@Injectable()
export class StreamAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const queryToken = request.query?.token;
    const headerToken = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.substring(7)
      : undefined;
    const token = (typeof queryToken === 'string' ? queryToken : undefined) || headerToken;
    if (!token) throw new UnauthorizedException('Missing stream token');

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
      request.workspaceId = payload.workspace_id;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid stream token');
    }
  }
}
