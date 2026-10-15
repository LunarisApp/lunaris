# Project Overview

Lunaris backend: API server for offline-first word processor.

### Key Technologies

- **Bun** - Pkg mgr + runtime
- **TypeScript** - Type safety
- **NestJS** - App framework
- **Fastify** - HTTP server
- **Drizzle** - ORM
- **PostgreSQL** - Database
- **Better Auth** - Authentication
- **Polar** - Payments
- **Resend** - Email
- **Zod** - Schema validation
- **Yjs** - CRDT for collaborative editing

### Packages

- `api` - `apps/api` - NestJS API application

### Testing

- **Framework**: Bun test runner (`bun:test`)
- **Test libs**: `@nestjs/testing`, `supertest`
- **Pattern**: `*.spec.ts` colocated with source (e.g., `src/sync/sync.controller.spec.ts`)
- **Style**: NestJS `TestingModule`, mocked providers, `spyOn` service methods

| Command | Description |
|---|---|
| `bun test` | Run all tests |
| `bun test --watch` | Watch |
| `bun test --coverage` | Coverage |
