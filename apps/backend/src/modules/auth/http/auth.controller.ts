import {
  AUTH_COOKIES,
  type AuthResponse,
  AuthResponseSchema,
  type LoginRequest,
  LoginRequestSchema,
  type RegisterRequest,
  RegisterRequestSchema,
} from '@forgeops/contracts';
import { Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { UnauthenticatedError } from '../../../common/errors/domain-error.js';
import {
  ApiProblemResponses,
  ApiZodBody,
  ApiZodResponse,
} from '../../../common/openapi/zod-openapi.js';
import { ZodBody } from '../../../common/validation/zod-validation.pipe.js';
import { toUserDto } from '../../users/user.mapper.js';
import { UsersRepository } from '../../users/users.repository.js';
import { AuthService, type ClientContext } from '../application/auth.service.js';
import { AuthCookies, readCookie } from './auth-cookies.js';
import { type AuthenticatedUser, CurrentUser, Public } from './auth.decorators.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookies,
    private readonly users: UsersRepository,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiZodBody(RegisterRequestSchema)
  @ApiZodResponse(201, AuthResponseSchema)
  @ApiProblemResponses(400, 403, 409)
  async register(
    @ZodBody(RegisterRequestSchema) body: RegisterRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(body, clientContext(request));
    this.cookies.set(response, result);
    return { user: toUserDto(result.user) };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiZodBody(LoginRequestSchema)
  @ApiZodResponse(200, AuthResponseSchema)
  @ApiProblemResponses(400, 401, 403)
  async login(
    @ZodBody(LoginRequestSchema) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(body, clientContext(request));
    this.cookies.set(response, result);
    return { user: toUserDto(result.user) };
  }

  /** Public because it runs exactly when the access token has expired. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiZodResponse(200, AuthResponseSchema)
  @ApiProblemResponses(401, 403)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    try {
      const result = await this.auth.refresh(
        readCookie(request, AUTH_COOKIES.refreshToken),
        clientContext(request),
      );
      this.cookies.set(response, result);
      return { user: toUserDto(result.user) };
    } catch (error) {
      // A dead refresh token is useless; clearing it stops the browser from retrying with it.
      if (error instanceof UnauthenticatedError) {
        this.cookies.clear(response);
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(request, AUTH_COOKIES.refreshToken));
    this.cookies.clear(response);
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiZodResponse(200, AuthResponseSchema)
  @ApiProblemResponses(401)
  async me(@CurrentUser() current: AuthenticatedUser): Promise<AuthResponse> {
    const user = await this.users.findById(current.id);
    if (!user) {
      throw new UnauthenticatedError();
    }
    return { user: toUserDto(user) };
  }
}

function clientContext(request: Request): ClientContext {
  return {
    userAgent: request.get('user-agent')?.slice(0, 512) ?? null,
    ipAddress: request.ip ?? null,
  };
}
