import { Module } from '@nestjs/common';
import { StudentHistoryService } from './student-history.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, StudentHistoryService],
  exports: [StudentsService],
})
export class StudentsModule {}
