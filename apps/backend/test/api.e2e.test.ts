import type { Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiModule } from '../src/api.module.js';
import { configureApiApp } from '../src/api.setup.js';

describe('API process (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ApiModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>();
    configureApiApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness at /health, outside the versioned prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('allows the configured web origin with credentials', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('returns 404 for unknown versioned routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
  });
});
