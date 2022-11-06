import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PostSmoke } from "./postSmoke.schema";
import { PostSmokeService } from "./postSmoke.service";
import { PostSmokeDto } from "./postSmokeDto";


@ApiTags('PostSmoke')
@Controller('api/postSmoke')
export class PostSmokeController {

    constructor(private readonly postSmokeService: PostSmokeService){

    }

    @Get('/current')
    getCurrentPostSmoke(): Promise<PostSmoke>{
        return this.postSmokeService.getCurrentPostSmoke();
    }

    @Post('/current')
    saveCurrentPostSmoke(@Body() dto: PostSmokeDto): Promise<PostSmoke>{
        return this.postSmokeService.saveCurrentPostSmoke(dto);
    }
    
}