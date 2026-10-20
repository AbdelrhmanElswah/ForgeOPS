import type { Server } from 'node:http';

import {
  type CreateTaskRequest,
  CreateTaskRequestSchema,
  ProblemDetailsSchema,
} from '@forgeops/contracts';
import { Controller, Get, type INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NotFoundError } from '../src/common/errors/domain-error.js';
import { ZodBody } from '../src/common/validation/zod-validation.pipe.js';
import { createTestApp } from './utils/create-test-app.js';

/** Test-only routes that exercise validation and error mapping end to end. */
@Controller('probe')
class ProbeController {
  @Post('echo')
  echo(@ZodBody(CreateTaskRequestSchema) body: CreateTaskRequest): CreateTaskRequest {
    return body;
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundError('Task');
  }

  @Get('crash')
  crash(): never {
    throw new Error('db password is hunter2');
  }
}

const validTask = {
  repositoryId: '0192f0c4-7a3e-7c1d-9b2a-5e6f7a8b9c0d',
  instruction: '  Fix the checkout bug and add regression tests  ',
};

describe('API process (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('serves liveness at /health, outside the versioned prefix', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });

    it('reports ready when every dependency answers', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        checks: { database: { status: 'up' }, redis: { status: 'up' } },
      });
    });

    it('returns 503 and names the failing dependency', async () => {
      const degraded = await createTestApp({
        redis: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      try {
        const response = await request(degraded.getHttpServer()).get('/health/ready').expect(503);

        expect(response.body).toMatchObject({
          status: 'error',
          checks: { database: { status: 'up' }, redis: { status: 'down' } },
        });
        expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
      } finally {
        await degraded.close();
      }
    });
  });

  describe('validation', () => {
    it('passes the parsed (trimmed) body to the handler', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe/echo')
        .send(validTask)
        .expect(201);

      expect(CreateTaskRequestSchema.parse(response.body).instruction).toBe(
        'Fix the checkout bug and add regression tests',
      );
    });

    it('rejects invalid bodies with field-level problem details', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe/echo')
        .send({ ...validTask, instruction: 'fix', status: 'completed' })
        .expect(400)
        .expect('content-type', /application\/problem\+json/);

      expect(response.body).toMatchObject({ code: 'validation_failed', status: 400 });
      const paths = (response.body as { errors: { path: string }[] }).errors.map((e) => e.path);
      expect(paths).toContain('instruction');
    });

    it('turns malformed JSON into a 400 problem, not a 500', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/probe/echo')
        .set('content-type', 'application/json')
        .send('{"instruction": ')
        .expect(400);

      expect(response.body).toMatchObject({ code: 'bad_request' });
    });
  });

  describe('errors', () => {
    it('maps domain errors to their HTTP status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/probe/not-found')
        .expect(404);

      expect(response.body).toMatchObject({ code: 'not_found', detail: 'Task was not found.' });
    });

    it('hides internal error messages but returns a trace id', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/probe/crash').expect(500);

      expect(response.body).toMatchObject({ code: 'internal_error' });
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
      // Parsing with the contract schema also proves the error body honours the API contract.
      expect(ProblemDetailsSchema.parse(response.body).traceId).toBe(
        response.headers['x-request-id'],
      );
    });

    it('answers unknown routes with a problem', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

      expect(response.body).toMatchObject({ code: 'not_found', instance: '/api/v1/nope' });
    });
  });

  describe('request ids', () => {
    it('reuses a safe incoming x-request-id', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('x-request-id', 'trace-abc-123');

      expect(response.headers['x-request-id']).toBe('trace-abc-123');
    });

    it.each([
      ['markup', '<script>alert(1)</script>'],
      ['log-forging spaces', 'abc level=error msg=forged'],
      ['oversized', 'a'.repeat(300)],
    ])('replaces an unsafe incoming x-request-id (%s)', async (_case, unsafe) => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('x-request-id', unsafe);

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('cors', () => {
    it('allows the configured web origin with credentials', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('openapi', () => {
    it('serves a spec generated from the controllers', async () => {
      const response = await request(app.getHttpServer()).get('/api/docs/openapi.json').expect(200);

      const paths = Object.keys((response.body as { paths: object }).paths);
      expect(paths).toEqual(expect.arrayContaining(['/health', '/health/ready']));
    });
  });
});
