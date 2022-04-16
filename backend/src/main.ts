import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'debug', 'log', 'verbose', 'warn'],
    cors: true,
  });

  const config = new DocumentBuilder()
    .setTitle('SmartSmokerAPI')
    .setDescription('API for smart smoker v2')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  app.enableCors({
    origin: true, //['http://localhost:3000', 'http://136.55.162.130', 'http://192.168.1.144:3000'],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 200
  });
  await app.listen(3001);
}
bootstrap();