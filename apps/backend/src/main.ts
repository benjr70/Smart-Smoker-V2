import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'debug', 'log', 'verbose', 'warn'],
  });

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
      // Dev cloud (accessed via Tailscale Serve HTTPS)
      'https://smoker-dev-cloud.tail74646.ts.net',
      'https://smoker-dev-cloud.tail74646.ts.net:8443',
      // Smoker devices (accessed via direct HTTP - no Tailscale Serve)
      'http://virtual-smoker:8080',
      'http://smoker:8080',
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
