import type { HttpClientOptions } from "@app/http-client/http-client.dto";
import { Inject, Injectable } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import axiosRetry from "axios-retry";
import { useLogger } from "evlog/nestjs";

@Injectable()
export class HttpClientService {
  readonly client: AxiosInstance;

  constructor(
    @Inject("HTTP_CLIENT_CONFIG") private readonly config: HttpClientOptions
  ) {
    const { userAgent, retries, timeout } = this.config;
    this.client = axios.create({
      headers: { "User-Agent": userAgent },
      timeout: timeout ?? 30 * 1000,
    });

    this.client.interceptors.request.use((reqConfig) => {
      let requestId: string;
      try {
        requestId = useLogger().getContext().requestId as string;
      } catch {
        requestId = crypto.randomUUID();
      }
      reqConfig.headers.set("X-Request-ID", requestId);
      reqConfig.headers.set("RequestId", requestId);
      return reqConfig;
    });

    axiosRetry(this.client, {
      retries: retries ?? 3,
      retryDelay: axiosRetry.exponentialDelay,
    });
  }
}
