import { Module } from "@nestjs/common";
import { YjsCompactionService } from "./yjs-compaction.service";

@Module({
  providers: [YjsCompactionService],
})
export class YjsModule {}
