import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@forgeops/contracts';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ForbiddenError } from '../../../common/errors/domain-error.js';
import { SKIP_CSRF } from './auth.decorators.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookies are sent automatically by the browser, so a malicious site could make a victim's
 * browser POST to our API with their session cookie (CSRF). Two layers stop that:
 * 1. SameSite=Lax cookies are not attached to cross-site POSTs in modern browsers.
 * 2. This guard requires a custom header. A cross-site form can't set custom headers, and a
 *    cross-site fetch() that does triggers a CORS preflight, which only our web origin passes.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(SKIP_CSRF, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || request.headers[CSRF_HEADER] === CSRF_HEADER_VALUE) {
      return true;
    }
    throw new ForbiddenError(`State-changing requests must send the ${CSRF_HEADER} header.`);
  }
}
