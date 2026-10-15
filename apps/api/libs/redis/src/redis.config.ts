import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { coerce, string } from "zod";

const optionalString = string().optional();
const optionalNumber = coerce.number().optional();

@Injectable()
export class RedisConfig {
  constructor(config: ConfigService) {
    this._host = optionalString.parse(config.get("REDIS_HOST"));
    this._port = optionalNumber.parse(config.get("REDIS_PORT"));
    this._password = optionalString.parse(config.get("REDIS_PASSWORD"));
  }

  private _host?: string;

  private _port?: number;

  private _password?: string;

  get defined() {
    const has = [this._host, this._port, this._password].filter(Boolean).length;
    if (has > 0 && has < 3)
      throw new Error(
        "REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD must all be set",
      );
    return has === 3;
  }

  get values() {
    if (!this.defined) return undefined;
    return {
      host: this._host!,
      port: this._port!,
      password: this._password!,
    };
  }
}
