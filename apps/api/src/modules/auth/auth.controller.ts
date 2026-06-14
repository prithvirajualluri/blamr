import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import type {
  RegisterTenantRequest,
  LoginRequest,
  RegisterUserRequest,
} from '@blamr/types';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-tenant')
  registerTenant(@Body() body: RegisterTenantRequest) {
    return this.authService.registerTenant(body);
  }

  @Post('login')
  login(@Body() body: LoginRequest) {
    return this.authService.login(body);
  }

  @Post('register')
  registerUser(@Body() body: RegisterUserRequest) {
    return this.authService.registerUser(body);
  }

  @Get('invite/:token')
  getInvite(@Param('token') token: string) {
    return this.authService.getInvitePreview(token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: { sub: string; workspace_id: string } }) {
    return this.authService.getMe(req.user.sub, req.user.workspace_id);
  }

  @Get('workspaces')
  @UseGuards(JwtAuthGuard)
  workspaces(@Req() req: { user: { sub: string } }) {
    return this.authService.listWorkspaces(req.user.sub);
  }

  @Post('switch-workspace')
  @UseGuards(JwtAuthGuard)
  switchWorkspace(
    @Req() req: { user: { sub: string } },
    @Body() body: { workspace_id: string },
  ) {
    return this.authService.switchWorkspace(req.user.sub, body.workspace_id);
  }
}
