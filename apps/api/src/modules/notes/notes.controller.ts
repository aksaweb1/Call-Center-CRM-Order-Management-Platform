import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/interfaces/auth.interface';
import { NotesService } from './notes.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Notes')
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @RequirePermissions(Permissions.NOTE_CREATE)
  create(@Body() dto: CreateNoteDto, @CurrentUser() user: AuthUser) {
    return this.notesService.create(dto, user.id);
  }

  @Get()
  @RequirePermissions(Permissions.NOTE_READ)
  list(
    @Query('customerId') customerId?: string,
    @Query('leadId') leadId?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notesService.list({
      customerId,
      leadId,
      userId,
      page,
      limit,
    });
  }

  @Patch(':id')
  @RequirePermissions(Permissions.NOTE_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateNoteDto, @CurrentUser() user: AuthUser) {
    return this.notesService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.NOTE_UPDATE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notesService.remove(id, user.id);
  }
}