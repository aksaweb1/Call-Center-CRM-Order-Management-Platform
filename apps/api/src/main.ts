import 'reflect-metadata';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Express } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { config } from './config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { requestId } from './common/middleware/request-id.middleware';

const logger = new Logger('Bootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Security hardening
  app.use(helmet());
  app.use(requestId);

  // CORS
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  // Global prefix
  app.setGlobalPrefix(config.apiPrefix);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Response envelope + uniform error shape
  // NOTE: TransformInterceptor must be registered LAST (innermost) so it runs
  // BEFORE ClassSerializerInterceptor mutates Prisma Decimal instances.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Call Center CRM API')
    .setDescription('Production call center CRM & order management platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document);

  // Health endpoint (plain express handlers for the health route)
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.get(config.apiPrefix + '/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  await app.listen(config.port, config.host);
  logger.log(`API running at http://${config.host}:${config.port}${config.apiPrefix}`);
  logger.log(`Swagger docs at http://localhost:${config.port}${config.apiPrefix}/docs`);
}

void bootstrap();