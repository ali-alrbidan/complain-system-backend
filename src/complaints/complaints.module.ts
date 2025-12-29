import { Module } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ComplaintsFilesController } from './complaints-files.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ComplaintsController, ComplaintsFilesController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
