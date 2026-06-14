import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import type { CreateUserRequest, InviteUserRequest, UserRole } from '@blamr/types';
import { UserEntity } from '../../entities/user.entity';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity';
import { WorkspaceInviteEntity } from '../../entities/workspace-invite.entity';
import { AuthService } from '../auth/auth.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly memberRepo: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInviteEntity)
    private readonly inviteRepo: Repository<WorkspaceInviteEntity>,
    private readonly authService: AuthService,
  ) {}

  async listMembers(workspaceId: string) {
    const members = await this.memberRepo.find({
      where: { workspace_id: workspaceId },
      relations: ['user'],
      order: { joined_at: 'ASC' },
    });
    return members.map((m) => ({
      user_id: m.user_id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joined_at: m.joined_at.toISOString(),
    }));
  }

  async listInvites(workspaceId: string) {
    const invites = await this.inviteRepo.find({
      where: { workspace_id: workspaceId, accepted_at: IsNull() },
      order: { created_at: 'DESC' },
    });
    const now = new Date();
    return invites
      .filter((i) => i.expires_at > now)
      .map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        token: i.token,
        expires_at: i.expires_at.toISOString(),
        created_at: i.created_at.toISOString(),
      }));
  }

  async createUser(workspaceId: string, dto: CreateUserRequest) {
    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const email = dto.email.toLowerCase();
    let user = await this.userRepo.findOne({ where: { email } });
    if (user) {
      const existing = await this.memberRepo.findOne({
        where: { user_id: user.id, workspace_id: workspaceId },
      });
      if (existing) {
        throw new ConflictException('User is already a member of this workspace');
      }
    } else {
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      user = await this.userRepo.save(
        this.userRepo.create({
          email,
          password_hash: passwordHash,
          name: dto.name.trim(),
        }),
      );
    }

    await this.memberRepo.save(
      this.memberRepo.create({
        user_id: user.id,
        workspace_id: workspaceId,
        role: dto.role,
      }),
    );

    return {
      user_id: user.id,
      email: user.email,
      name: user.name,
      role: dto.role,
    };
  }

  async inviteUser(workspaceId: string, invitedByUserId: string, dto: InviteUserRequest) {
    const email = dto.email.toLowerCase();

    const existingMember = await this.memberRepo
      .createQueryBuilder('m')
      .innerJoin('m.user', 'u')
      .where('m.workspace_id = :workspaceId', { workspaceId })
      .andWhere('u.email = :email', { email })
      .getOne();
    if (existingMember) {
      throw new ConflictException('User is already a member');
    }

    const pending = await this.inviteRepo.findOne({
      where: { workspace_id: workspaceId, email, accepted_at: IsNull() },
    });
    if (pending && pending.expires_at > new Date()) {
      throw new ConflictException('Pending invite already exists for this email');
    }

    const token = this.authService.createInviteToken();
    const invite = await this.inviteRepo.save(
      this.inviteRepo.create({
        workspace_id: workspaceId,
        email,
        role: dto.role,
        token,
        invited_by_user_id: invitedByUserId,
        expires_at: this.authService.inviteExpiresAt(),
      }),
    );

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expires_at: invite.expires_at.toISOString(),
      created_at: invite.created_at.toISOString(),
    };
  }

  async updateRole(workspaceId: string, targetUserId: string, role: UserRole, actorUserId: string) {
    if (targetUserId === actorUserId && role !== 'admin') {
      throw new ForbiddenException('Cannot demote yourself');
    }

    const membership = await this.memberRepo.findOne({
      where: { user_id: targetUserId, workspace_id: workspaceId },
    });
    if (!membership) throw new NotFoundException('Member not found');

    if (membership.role === 'admin' && role !== 'admin') {
      const adminCount = await this.memberRepo.count({
        where: { workspace_id: workspaceId, role: 'admin' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin');
      }
    }

    membership.role = role;
    await this.memberRepo.save(membership);
    return { user_id: targetUserId, role };
  }

  async removeMember(workspaceId: string, targetUserId: string, actorUserId: string) {
    if (targetUserId === actorUserId) {
      throw new ForbiddenException('Cannot remove yourself');
    }

    const membership = await this.memberRepo.findOne({
      where: { user_id: targetUserId, workspace_id: workspaceId },
    });
    if (!membership) throw new NotFoundException('Member not found');

    if (membership.role === 'admin') {
      const adminCount = await this.memberRepo.count({
        where: { workspace_id: workspaceId, role: 'admin' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin');
      }
    }

    await this.memberRepo.delete(membership.id);
    return { removed: true };
  }

  async revokeInvite(workspaceId: string, inviteId: string) {
    const invite = await this.inviteRepo.findOne({
      where: { id: inviteId, workspace_id: workspaceId },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    await this.inviteRepo.delete(invite.id);
    return { revoked: true };
  }
}
