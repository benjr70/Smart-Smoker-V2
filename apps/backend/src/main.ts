import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Validation boundary at the framework edge: reject unknown/extra fields and
  // validate/coerce request bodies against class-validator DTO decorators.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SmartSmokerAPI')
    .setDescription('API for smart smoker v2')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  app.enableCors({
    origin: [
      // Production cloud (accessed via Tailscale Serve HTTPS)
      'https://smokecloud.tail74646.ts.net',
      'https://smokecloud.tail74646.ts.net:8443',
      // Dev cloud (accessed via Tailscale Serve HTTPS; renamed from
      // smoker-dev-cloud in PR #262)
      'https://smart-smoker-dev-cloud.tail74646.ts.net',
      'https://smart-smoker-dev-cloud.tail74646.ts.net:8443',
      // Smoker devices (direct HTTP - no Tailscale Serve). On the device
      // itself the app loads from localhost/short name; the post-deploy e2e
      // browser reaches the same UI over the tailnet FQDN, so both origin
      // spellings must be allowed.
      'http://virtual-smoker:8080',
      'http://virtual-smoker.tail74646.ts.net:8080',
      'http://smoker:8080',
      'http://smoker.tail74646.ts.net:8080',
      // Local development
      'http://localhost:8080',
      'http://localhost:3000',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 200,
  });
  await app.listen(3001);
}
bootstrap();
