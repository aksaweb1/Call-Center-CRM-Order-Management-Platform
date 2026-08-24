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
import { ProductsService } from './products.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateStockDto,
} from './dto/product.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorator';
import { Permissions } from '../permissions/permissions.constants';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // Categories
  @Get('categories')
  @RequirePermissions(Permissions.CATEGORY_READ)
  listCategories() {
    return this.productsService.listCategories();
  }

  @Post('categories')
  @RequirePermissions(Permissions.CATEGORY_CREATE)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.productsService.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permissions.CATEGORY_UPDATE)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.productsService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(Permissions.CATEGORY_DELETE)
  removeCategory(@Param('id') id: string) {
    return this.productsService.removeCategory(id);
  }

  // Products
  @Get()
  @RequirePermissions(Permissions.PRODUCT_READ)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lowStock') lowStock?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.productsService.findAll({
      page: page ?? 1,
      limit: limit ?? 20,
      search,
      categoryId,
      lowStock: lowStock === 'true',
      sortBy,
      sortOrder,
    }).then(({ total, items }) => ({
      items,
      total,
      page: page ?? 1,
      limit: limit ?? 20,
      totalPages: Math.ceil(total / (limit ?? 20)),
    }));
  }

  @Post()
  @RequirePermissions(Permissions.PRODUCT_CREATE)
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.productsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.PRODUCT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/stock')
  @RequirePermissions(Permissions.INVENTORY_UPDATE)
  adjustStock(
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.productsService.adjustStock(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions(Permissions.PRODUCT_DELETE)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}