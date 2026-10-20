import { Module } from '@nestjs/common';

import { PrismaUsersRepository } from './infrastructure/prisma-users.repository.js';
import { UsersRepository } from './users.repository.js';

@Module({
  // Binds the port to its adapter. Tests override `UsersRepository` with an in-memory fake.
  providers: [{ provide: UsersRepository, useClass: PrismaUsersRepository }],
  exports: [UsersRepository],
})
export class UsersModule {}
