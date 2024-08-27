import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RatingsService } from "./ratings.service";
import { Ratings } from "./ratings.schema";
import { RatingsDto } from "./ratingsDto";


@ApiTags('Ratings')
@Controller('api/ratings')
export class RatingsController {
    constructor(private readonly ratingsService: RatingsService){

    }

    @Get('')
    getCurrentRatings(): Promise<Ratings> {
        return this.ratingsService.getCurrentRating();
    }

    @Post('')
    saveCurrentRatings(@Body() dto: RatingsDto): Promise<Ratings> {
        return this.ratingsService.saveCurrentRatings(dto);
    }

    @Post('/:id')
    updateRatings(@Param('id') id: string, @Body() dto: RatingsDto): Promise<Ratings> {
        return this.ratingsService.update(id, dto);
    }

    @Get('/:id')
    getRatingById(@Param('id') id: string): Promise<Ratings> {
        return this.ratingsService.getById(id);
    }

    @Delete('/:id')
    DeleteById(@Param('id') id: string){
        return this.ratingsService.Delete(id);
    }
}