import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { Server } from 'http';

describe('Application (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health should return service status', async () => {
    const res = await request(httpServer).get('/health').expect(200);

    const body = res.body as {
      data: {
        status: string;
        timestamp: string;
        services: { database: string; redis: string };
      };
    };
    expect(body.data).toBeDefined();
    expect(body.data.status).toBeDefined();
    expect(body.data.timestamp).toBeDefined();
    expect(body.data.services).toBeDefined();
    expect(body.data.services.database).toBeDefined();
    expect(body.data.services.redis).toBeDefined();
  });

  it('GET /auth/me should return 401 without token', async () => {
    await request(httpServer).get('/auth/me').expect(401);
  });

  it('POST /auth/register should validate input', async () => {
    await request(httpServer)
      .post('/auth/register')
      .send({}) // empty body
      .expect(400);
  });
});
