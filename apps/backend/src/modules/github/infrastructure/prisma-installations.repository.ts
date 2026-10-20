import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { GitHubRepositoryInfo } from '../application/github-app.client.js';
import {
  type InstallationRecord,
  InstallationsRepository,
  type InstallationSnapshot,
} from '../application/installations.repository.js';

// GitHub ids are BigInt columns; the application uses numbers (exact below 2^53).
const toBigInt = (value: number) => BigInt(value);

const INSTALLATION_FIELDS = {
  id: true,
  installationId: true,
  userId: true,
  accountLogin: true,
  accountType: true,
  suspendedAt: true,
  removedAt: true,
  createdAt: true,
  _count: { select: { repositories: { where: { removedAt: null } } } },
} as const;

type InstallationRow = Prisma.GitHubInstallationGetPayload<{ select: typeof INSTALLATION_FIELDS }>;

function toRecord(row: InstallationRow): InstallationRecord {
  return {
    id: row.id,
    installationId: Number(row.installationId),
    userId: row.userId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    suspendedAt: row.suspendedAt,
    removedAt: row.removedAt,
    repositoryCount: row._count.repositories,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaInstallationsRepository extends InstallationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByInstallationId(installationId: number): Promise<InstallationRecord | null> {
    const row = await this.prisma.gitHubInstallation.findUnique({
      where: { installationId: toBigInt(installationId) },
      select: INSTALLATION_FIELDS,
    });
    return row && toRecord(row);
  }

  async saveForUser(
    userId: string,
    { installation, repositories }: InstallationSnapshot,
    now: Date,
  ): Promise<InstallationRecord> {
    return this.prisma.$transaction(async (tx) => {
      const details = {
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        suspendedAt: installation.suspended ? now : null,
        removedAt: null,
      };
      const { id } = await tx.gitHubInstallation.upsert({
        where: { installationId: toBigInt(installation.installationId) },
        create: { installationId: toBigInt(installation.installationId), userId, ...details },
        update: { userId, ...details },
        select: { id: true },
      });
      await reconcileRepositories(tx, id, repositories, now);
      return toRecord(
        await tx.gitHubInstallation.findUniqueOrThrow({
          where: { id },
          select: INSTALLATION_FIELDS,
        }),
      );
    });
  }

  async refresh({ installation, repositories }: InstallationSnapshot, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.gitHubInstallation.findUnique({
        where: { installationId: toBigInt(installation.installationId) },
        select: { id: true },
      });
      if (!existing) {
        return false;
      }
      await tx.gitHubInstallation.update({
        where: { id: existing.id },
        data: {
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          suspendedAt: installation.suspended ? now : null,
        },
      });
      await reconcileRepositories(tx, existing.id, repositories, now);
      return true;
    });
  }

  async setSuspended(installationId: number, suspendedAt: Date | null): Promise<void> {
    await this.prisma.gitHubInstallation.updateMany({
      where: { installationId: toBigInt(installationId) },
      data: { suspendedAt },
    });
  }

  async markRemoved(installationId: number, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const installation = await tx.gitHubInstallation.findUnique({
        where: { installationId: toBigInt(installationId) },
        select: { id: true },
      });
      if (!installation) return;
      await tx.gitHubInstallation.update({
        where: { id: installation.id },
        data: { removedAt: now },
      });
      await tx.repository.updateMany({
        where: { installationId: installation.id, removedAt: null },
        data: { removedAt: now },
      });
    });
  }

  async listForUser(userId: string): Promise<InstallationRecord[]> {
    const rows = await this.prisma.gitHubInstallation.findMany({
      where: { userId, removedAt: null },
      orderBy: { createdAt: 'asc' },
      select: INSTALLATION_FIELDS,
    });
    return rows.map(toRecord);
  }
}

async function reconcileRepositories(
  tx: Prisma.TransactionClient,
  installationDbId: string,
  repositories: GitHubRepositoryInfo[],
  now: Date,
): Promise<void> {
  for (const repo of repositories) {
    const fields = {
      owner: repo.owner,
      name: repo.name,
      defaultBranch: repo.defaultBranch,
      isPrivate: repo.isPrivate,
      installationId: installationDbId,
      removedAt: null,
    };
    // Keyed by GitHub's stable repo id, so a renamed or transferred repo keeps its history.
    await tx.repository.upsert({
      where: { githubRepoId: toBigInt(repo.githubRepoId) },
      create: { githubRepoId: toBigInt(repo.githubRepoId), ...fields },
      update: fields,
    });
  }
  await tx.repository.updateMany({
    where: {
      installationId: installationDbId,
      removedAt: null,
      githubRepoId: { notIn: repositories.map((repo) => toBigInt(repo.githubRepoId)) },
    },
    data: { removedAt: now },
  });
}
