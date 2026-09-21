# m324-group-2

Real estate platform built for module M324. Two microservices manage localities
and properties.

All our documentation is in Google Docs, only the Kanban board is in Github.
[Google Doc](https://docs.google.com/document/d/18GEajNwyuiRuwFKLFIs3fCTuywTNLcMAslGGGAe75bw/edit?usp=sharing)
[Kanban](https://github.com/users/Cuerillius/projects/2)

## Services

| Service      | Port | Schema       | Responsibility                           |
| ------------ | ---- | ------------ | ---------------------------------------- |
| `locations`  | 3001 | `locations`  | User stories 1 and 2, manages localities |
| `properties` | 3002 | `properties` | User story 3, manages properties         |

The two services are independent projects that happen to share a repository.
They never import each other's code. `properties` validates a locality by
calling the HTTP endpoint of `locations`, never by reading its tables, and the
database enforces that: `properties_user` has no privileges on the `locations`
schema.

## Getting started

Requires Bun 1.3 and Docker. Bun is the package manager, the runtime and the
test runner; there is no build step, the services run their TypeScript directly.

```bash
cp .env.example .env                                           # for Docker Compose
cp services/locations/.env.example services/locations/.env     # for bun run dev
cp services/properties/.env.example services/properties/.env   # for bun run dev
bun install
bun run db:up       # starts Postgres and creates both schemas and roles
bun run dev         # runs both services with hot reload
```

Then check that both are alive:

```bash
curl localhost:3001/health
curl localhost:3002/health
```

To run everything in containers instead:

```bash
docker compose --profile app up --build
```

## Everyday commands

| Command                 | What it does                                 |
| ----------------------- | -------------------------------------------- |
| `bun run test`          | Unit tests for both services                 |
| `bun run test:coverage` | Unit tests with a coverage report            |
| `bun run lint`          | ESLint across the workspace                  |
| `bun run typecheck`     | TypeScript with no emit                      |
| `bun run format`        | Prettier, writes in place                    |
| `bun run db:migrate`    | Applies Drizzle migrations for both services |

Run a single service with `bun run --filter @m324/locations <script>`, or run the
script from inside the service directory. Bun loads `.env` from the directory it
runs in, so copy `services/<service>/.env.example` to `.env` there for local
development.

## Architecture

Each service is split into four layers, and dependencies only ever point inward.

```
routes.ts       HTTP only. Parses input, calls the service, maps errors to status codes.
service.ts      Business logic. A factory function that receives its dependencies.
repository.ts   Database access through Drizzle.
schema.ts       Drizzle table definitions and Zod validation schemas.
```

The important rule is that `service.ts` never imports Hono and never imports the
database client. It receives a repository as a plain argument. That is what lets
a unit test hand it a small object literal instead of a database, which is the
isolation the assignment requires.

```ts
// The shape a story author writes
export function createLocationService(deps: { repo: LocationRepository }) {
  return {
    async create(input: NewLocation) {
      if (await deps.repo.findByPostalCode(input.postalCode)) {
        throw new ConflictError('A locality with this postal code already exists');
      }
      return deps.repo.insert(input);
    },
  };
}

// The matching unit test needs no database and no framework
const service = createLocationService({
  repo: {
    findByPostalCode: async () => ({ id: '1' }),
    insert: async () => {
      throw new Error('unreachable');
    },
  },
});
await expect(service.create(input)).rejects.toBeInstanceOf(ConflictError);
```

### Errors

`src/errors.ts` defines the domain errors. Throw those from the service layer.
The router in `src/app.ts` is the only place that knows about status codes, and
it maps every error onto the same response envelope:

```json
{ "error": { "code": "CONFLICT", "message": "..." } }
```

| Error                              | Status |
| ---------------------------------- | ------ |
| `ValidationError`                  | 400    |
| `NotFoundError`                    | 404    |
| `ConflictError`                    | 409    |
| `LocationsServiceUnavailableError` | 502    |
| anything else                      | 500    |

## Adding a user story

1. Branch off `main` as `feat/<issue-id>-<description>`.
2. Define the table in `src/db/schema.ts`, then run `bun run --filter <service> db:generate`.
3. Write `repository.ts`, `service.ts` and `routes.ts` in the story's own folder.
4. Register the router in `src/app.ts` and add whatever it needs to `AppDependencies`.
5. Write at least two to three unit tests per endpoint covering happy and sad
   paths, documented with JSDoc as in the existing tests.
6. Open a pull request. It needs one review and green CI before it merges.

## Testing

Unit tests live in `test/` next to each service and run with `bun test`. They must
not touch the network or the database. `test/app.test.ts` and
`test/locations-client.test.ts` show the pattern.

Integration tests live in `test/integration/` and run with `bun run test:integration`.
They require a real Postgres instance and the `INTEGRATION=1` environment variable
(plus `DATABASE_URL`). CI spins up a Postgres container, initialises the schemas via
`db/init/01-init.sh`, and then runs both integration suites with the per-service
credentials. Unit tests (`bun test`) never run the integration suite — they are
excluded unless `INTEGRATION=1` is set.
