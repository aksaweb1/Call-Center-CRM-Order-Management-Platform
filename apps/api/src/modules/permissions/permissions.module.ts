import { Module } from '@nestjs/common';
import { PermissionSeeder } from './seeds/permission.seeder';
import { PermissionsController } from './permissions.controller';

/**
 * Holds permission constants + the system seeder. Imported by users module.
 */
@Module({
  controllers: [PermissionsController],
  providers: [PermissionSeeder],
  exports: [],
})
export class PermissionsModule {}