import { Global, Module } from "@nestjs/common";
import { DrizzleModule } from "@nestjs/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { ConfigurationModule } from "../../../src/configuration/configuration.module";
import { DatabaseConfig } from "./db.config";
import { DatabaseService } from "./db.service";

@Global()
@Module({
  imports: [
    DrizzleModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [DatabaseConfig],
      useFactory: (config: DatabaseConfig) => ({
        drizzle,
        connection: {
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.name,
          ssl: config.ssl ? { rejectUnauthorized: false } : false,
        },
        casing: "snake_case" as const,
      }),
    }),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
