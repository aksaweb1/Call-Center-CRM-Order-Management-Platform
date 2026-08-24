import { Module } from '@nestjs/common';
import { PermissionSeeder } from '../permissions/seeds/permission.seeder';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}