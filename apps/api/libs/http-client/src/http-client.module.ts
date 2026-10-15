import { HttpClientOptions } from "@app/http-client/http-client.dto";
import { DynamicModule, Global, Module } from "@nestjs/common";
import { HttpClientService } from "./http-client.service";

@Global()
@Module({
  providers: [HttpClientService],
  exports: [HttpClientService],
})
export class HttpClientModule {
  static forRoot(options: HttpClientOptions): DynamicModule {
    return {
      module: HttpClientModule,
      providers: [
        {
          provide: "HTTP_CLIENT_CONFIG",
          useValue: options,
        },
      ],
      exports: ["HTTP_CLIENT_CONFIG"],
    };
  }
}
