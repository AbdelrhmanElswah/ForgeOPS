import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { type ReadinessReport, ReadinessService } from './readiness.service.js';

/**
 * Probes live at /health (no /api/v1 prefix) so load balancers and Docker health checks
 * never break when the API version changes.
 */
@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  /** Liveness: "is the process up?" Deliberately checks nothing else. */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: "can it serve traffic?" 503 tells a load balancer to route elsewhere. */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (database, Redis)' })
  @ApiResponse({ status: 200, description: 'All dependencies are reachable' })
  @ApiResponse({ status: 503, description: 'At least one dependency is down' })
  async ready(@Res({ passthrough: true }) response: Response): Promise<ReadinessReport> {
    const report = await this.readiness.check();
    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
