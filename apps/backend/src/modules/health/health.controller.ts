import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';

/**
 * Liveness probe: "is the process up?". Lives at `/health` (no `/api/v1` prefix) so
 * load balancers and Docker health checks never break when the API version changes.
 * Readiness (database/Redis reachable) is added with @nestjs/terminus in step 1.6.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
