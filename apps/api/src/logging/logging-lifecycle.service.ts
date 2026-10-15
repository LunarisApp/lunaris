import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { flushLogDrain } from "../instrument";

@Injectable()
export class LoggingLifecycleService implements OnApplicationShutdown {
  async onApplicationShutdown() {
    await flushLogDrain();
  }
}
