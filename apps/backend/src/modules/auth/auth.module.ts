import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { AppConfig } from '../../common/config/app-config.service.js';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './application/auth.service.js';
import { PasswordHasher } from './application/password-hasher.js';
import { SessionsRepository } from './application/sessions.repository.js';
import { JWT_AUDIENCE, JWT_ISSUER, TokenService } from './application/token.service.js';
import { AuthCookies } from './http/auth-cookies.js';
import { AuthController } from './http/auth.controller.js';
import { CsrfGuard } from './http/csrf.guard.js';
import { JwtAuthGuard } from './http/jwt-auth.guard.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { PrismaSessionsRepository } from './infrastructure/prisma-sessions.repository.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS'),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        // Pinning the algorithm blocks "alg: none" and algorithm-confusion attacks.
        verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AuthCookies,
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: SessionsRepository, useClass: PrismaSessionsRepository },
    // Global guards run in registration order: reject forged cross-site requests first,
    // then authenticate.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
