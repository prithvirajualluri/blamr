import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  AuthResponse,
  AuthUser,
  JwtPayload,
  RegisterTenantRequest,
  LoginRequest,
  RegisterUserRequest,
} from '@blamr/types';
import { DEFAULT_WORKSPACE_SETTINGS } from '@blamr/types';
import { UserEntity } from '../../entities/user.entity';
import { WorkspaceEntity } from '../../entities/workspace.entity';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity';
import { WorkspaceInviteEntity } from '../../entities/workspace-invite.entity';

const BCRYPT_ROUNDS = 10;
const INVITE_TTL_DAYS = 7;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly memberRepo: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInviteEntity)
    private readonly inviteRepo: Repository<WorkspaceInviteEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async registerTenant(dto: RegisterTenantRequest): Promise<AuthResponse> {
    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existingUser = await this.userRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    let slug = dto.slug?.trim() || slugify(dto.workspace_name);
    if (!slug) slug = `ws-${uuidv4().slice(0, 8)}`;

    const slugTaken = await this.workspaceRepo.findOne({ where: { slug } });
    if (slugTaken) {
      throw new ConflictException('Workspace slug already taken');
    }

    const workspaceId = uuidv4();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.userRepo.save(
      this.userRepo.create({
        email: dto.email.toLowerCase(),
        password_hash: passwordHash,
        name: dto.name.trim(),
        last_login_at: new Date(),
      }),
    );

    await this.workspaceRepo.save(
      this.workspaceRepo.create({
        id: workspaceId,
        name: dto.workspace_name.trim(),
        slug,
        owner_email: user.email,
        plan: 'oss',
        settings: DEFAULT_WORKSPACE_SETTINGS,
      }),
    );

    await this.memberRepo.save(
      this.memberRepo.create({
        user_id: user.id,
        workspace_id: workspaceId,
        role: 'admin',
      }),
    );

    return this.issueToken(user, workspaceId, 'admin');
  }

  async login(dto: LoginRequest): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = await this.memberRepo.findOne({
      where: { user_id: user.id },
      order: { joined_at: 'ASC' },
    });
    if (!membership) {
      throw new UnauthorizedException('No workspace membership found');
    }

    await this.userRepo.update(user.id, { last_login_at: new Date() });

    return this.issueToken(user, membership.workspace_id, membership.role);
  }

  async registerUser(dto: RegisterUserRequest): Promise<AuthResponse> {
    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const invite = await this.inviteRepo.findOne({
      where: { token: dto.invite_token },
    });
    if (!invite || invite.accepted_at) {
      throw new NotFoundException('Invalid or expired invite');
    }
    if (invite.expires_at < new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    let user = await this.userRepo.findOne({ where: { email: invite.email } });
    if (user) {
      const valid = await bcrypt.compare(dto.password, user.password_hash);
      if (!valid) {
        throw new UnauthorizedException('Invalid password for existing account');
      }
      const existing = await this.memberRepo.findOne({
        where: { user_id: user.id, workspace_id: invite.workspace_id },
      });
      if (existing) {
        throw new ConflictException('Already a member of this workspace');
      }
      if (dto.name.trim()) {
        await this.userRepo.update(user.id, { name: dto.name.trim() });
        user.name = dto.name.trim();
      }
    } else {
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      user = await this.userRepo.save(
        this.userRepo.create({
          email: invite.email,
          password_hash: passwordHash,
          name: dto.name.trim(),
          last_login_at: new Date(),
        }),
      );
    }

    await this.memberRepo.save(
      this.memberRepo.create({
        user_id: user.id,
        workspace_id: invite.workspace_id,
        role: invite.role,
      }),
    );

    await this.inviteRepo.update(invite.id, { accepted_at: new Date() });

    return this.issueToken(user, invite.workspace_id, invite.role);
  }

  async getMe(userId: string, workspaceId: string): Promise<AuthUser> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const membership = await this.memberRepo.findOne({
      where: { user_id: userId, workspace_id: workspaceId },
    });
    if (!membership) throw new UnauthorizedException('Not a member of this workspace');

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      workspace_id: workspaceId,
      role: membership.role,
    };
  }

  async switchWorkspace(userId: string, workspaceId: string): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const membership = await this.memberRepo.findOne({
      where: { user_id: userId, workspace_id: workspaceId },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    return this.issueToken(user, workspaceId, membership.role);
  }

  async listWorkspaces(userId: string) {
    const memberships = await this.memberRepo.find({
      where: { user_id: userId },
      relations: ['workspace'],
      order: { joined_at: 'ASC' },
    });
    return memberships.map((m) => ({
      id: m.workspace_id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      joined_at: m.joined_at.toISOString(),
    }));
  }

  async getInvitePreview(token: string) {
    const invite = await this.inviteRepo.findOne({
      where: { token },
      relations: ['workspace'],
    });
    if (!invite || invite.accepted_at) {
      throw new NotFoundException('Invalid invite');
    }
    if (invite.expires_at < new Date()) {
      throw new BadRequestException('Invite has expired');
    }
    return {
      email: invite.email,
      role: invite.role,
      workspace_name: invite.workspace.name,
      expires_at: invite.expires_at.toISOString(),
    };
  }

  createInviteToken(): string {
    return randomBytes(24).toString('hex');
  }

  inviteExpiresAt(): Date {
    const d = new Date();
    d.setDate(d.getDate() + INVITE_TTL_DAYS);
    return d;
  }

  private async issueToken(
    user: UserEntity,
    workspaceId: string,
    role: JwtPayload['role'],
  ): Promise<AuthResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      workspace_id: workspaceId,
      role,
    };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workspace_id: workspaceId,
        role,
      },
    };
  }
}