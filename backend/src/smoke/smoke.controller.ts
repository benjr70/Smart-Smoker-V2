import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Smoke } from "./smoke.schema";
import { SmokeService } from "./smoke.service";

@ApiTags('Smoke')
@Controller('api/smoke')
export class SmokeController {
    constructor(private readonly smokeService: SmokeService){}

    @Post()
    CreateSmoke(): Promise<Smoke> {
        return this.CreateSmoke();
    }
 
    @Get("/:id")
    getById(@Param('id') id: string): Promise<Smoke>{
        return this.smokeService.GetById(id);
    }
}