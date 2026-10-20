import type { RepositorySettings } from '@forgeops/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  type RepositoryListQuery,
  type RepositoryRecord,
  RepositoriesRepository,
} from '../application/repositories.repository.js';

const REPOSITORY_FIELDS = {
  id: true,
  githubRepoId: true,
  owner: true,
  name: true,
  defaultBranch: true,
  isPrivate: true,
  settings: true,
  createdAt: true,
  installation: { select: { installationId: true } },
} as const;

type RepositoryRow = Prisma.RepositoryGetPayload<{ select: typeof REPOSITORY_FIELDS }>;

/** The ownership filter, applied to every query in this adapter. */
function ownedBy(userId: string): Prisma.RepositoryWhereInput {
  return { removedAt: null, installation: { userId, removedAt: null } };
}

function toRecord(row: RepositoryRow): RepositoryRecord {
  return {
    id: row.id,
    githubRepoId: Number(row.githubRepoId),
    githubInstallationId: Number(row.installation.installationId),
    owner: row.owner,
    name: row.name,
    defaultBranch: row.defaultBranch,
    isPrivate: row.isPrivate,
    settings: row.settings,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaRepositoriesRepository extends RepositoriesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findOwned(userId: string, id: string): Promise<RepositoryRecord | null> {
    const row = await this.prisma.repository.findFirst({
      where: { id, ...ownedBy(userId) },
      select: REPOSITORY_FIELDS,
    });
    return row && toRecord(row);
  }

  async findForWorker(id: string): Promise<RepositoryRecord | null> {
    const row = await this.prisma.repository.findFirst({
      where: { id, removedAt: null, installation: { removedAt: null } },
      select: REPOSITORY_FIELDS,
    });
    return row && toRecord(row);
  }

  async listOwned(
    userId: string,
    { limit, cursor, search }: RepositoryListQuery,
  ): Promise<{ items: RepositoryRecord[]; nextCursor: string | null }> {
    const rows = await this.prisma.repository.findMany({
      where: {
        ...ownedBy(userId),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { owner: { contains: search, mode: 'insensitive' } },
          ],
        }),
        // Keyset pagination: UUID v7 ids sort by creation time, so "id > cursor" is stable
        // even while rows are added, unlike OFFSET which skips or repeats items.
        ...(cursor && { id: { gt: cursor } }),
      },
      orderBy: { id: 'asc' },
      take: limit + 1, // one extra row tells us whether another page exists
      select: REPOSITORY_FIELDS,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toRecord),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async saveSettings(id: string, settings: RepositorySettings): Promise<RepositoryRecord> {
    return toRecord(
      await this.prisma.repository.update({
        where: { id },
        data: { settings },
        select: REPOSITORY_FIELDS,
      }),
    );
  }
}
