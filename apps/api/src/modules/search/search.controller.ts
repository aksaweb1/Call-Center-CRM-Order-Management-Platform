import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @RequirePermissions(Permissions.CUSTOMER_READ)
  @ApiQuery({ name: 'q' })
  search(@Query('q') q: string, @Query('limit') limit?: number) {
    return this.searchService.search(q, { limit: limit ? Number(limit) : undefined });
  }
}