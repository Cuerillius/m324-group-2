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
They never import each other's code; what they have in common lives in the
`@m324/shared` package under `packages/shared`. `properties` validates a locality by
calling the HTTP endpoint of `locations`, never by reading its tables, and the
database enforces that: `properties_user` has no privileges on the `locations`
schema.

## API

Both services answer JSON and share the conventions below.

| Method | Path             | Service    | What it does                                        |
| ------ | ---------------- | ---------- | --------------------------------------------------- |
| `POST` | `/locations`     | locations  | Records a locality (user story 1)                   |
| `GET`  | `/locations`     | locations  | Pages through the localities by name (user story 2) |
| `GET`  | `/locations/:id` | locations  | One locality, used by properties to verify ids      |
| `POST` | `/properties`    | properties | Records a property (user story 3)                   |
| `GET`  | `/properties`    | properties | Pages through the properties, oldest first          |
| `GET`  | `/health`        | both       | Liveness, reports the running commit                |
| `GET`  | `/health/ready`  | both       | Readiness, 503 while the database is down           |

- **Request bodies** must be sent with `Content-Type: application/json`.
- **Overviews** take `limit` (1 to 500, default 100) and `offset` (default 0)
  and answer `{ items, total, limit, offset }`. When nothing is recorded at all,
  the answer also carries a `message`. Unknown or repeated query parameters are
  rejected rather than ignored.
- **Errors** always use the envelope described under [Errors](#errors).

```bash
curl -X POST localhost:3001/locations -H 'Content-Type: application/json' \
  -d '{"name":"Niederhasli","postalCode":"8155","foundingDate":"1899-05-15","population":5543}'
curl 'localhost:3001/locations?limit=20&offset=40'
```

## Getting started

Requires Bun 1.3 and Docker. Bun is the package manager, the runtime and the
test runner; there is no build step, the services run their TypeScript directly.

```bash
cp .env.example .env                                           # for Docker Compose
cp services/locations/.env.example services/locations/.env     # for bun run dev
cp services/properties/.env.example services/properties/.env   # for bun run dev
bun install
bun run db:up       # starts Postgres and creates both service roles
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

Inside `src/`, each service is split into layers, and dependencies only ever point inward.

```
<story>/routes.ts       HTTP only. Validates input, calls the service, returns JSON.
<story>/service.ts      Business logic. A factory function that receives its dependencies.
<story>/repository.ts   Database access through Drizzle.
<story>/schema.ts       Zod validation schemas and the types derived from the table.
db/schema.ts            Drizzle table definitions, the source of the migrations.
```

Code both services need lives in `packages/shared` and is imported by subpath,
e.g. `@m324/shared/validation`. It holds no business logic of either service.

```
app.ts                  App shell: health endpoints, 404 and the error envelope.
config.ts               Environment variables every service needs.
db.ts                   The readiness check behind GET /health/ready.
errors.ts               Domain errors the service layer throws.
migrate.ts              Startup migrations with a deadline.
validation.ts           Request body and paging validation shared by all routes.
```

The important rule is that `service.ts` never imports Hono and never imports the
database client. It receives its dependencies as plain arguments. That is what
lets a unit test hand it small object literals instead of a database or another
service, which is the isolation the assignment requires.

```ts
// The shape a story author writes (properties/service.ts, shortened)
export function createPropertyService(deps: {
  repo: PropertyRepository;
  locations: LocationsClient;
}) {
  return {
    async create(input: NewProperty) {
      if (!(await deps.locations.findById(input.locationId))) {
        throw new ValidationError(INVALID_PROPERTY_MESSAGE, {
          locationId: [`No locality with id ${input.locationId} exists`],
        });
      }
      return deps.repo.insert(input);
    },
  };
}

// The matching unit test needs no database, no network and no framework
const service = createPropertyService({
  repo: {
    insert: async () => {
      throw new Error('unreachable');
    },
    findPage: async () => {
      throw new Error('unreachable');
    },
  },
  locations: { findById: async () => null },
});
await expect(service.create(input)).rejects.toBeInstanceOf(ValidationError);
```

Routes validate with the helpers from `@m324/shared/validation`, so every
endpoint reports problems the same way:

```ts
routes.get('/', pageQuery('The properties could not be listed, ...'), async (c) =>
  c.json(await service.list(c.req.valid('query'))),
);
routes.post('/', jsonBody(newPropertySchema, INVALID_PROPERTY_MESSAGE), async (c) =>
  c.json(await service.create(c.req.valid('json')), 201),
);
```

### Errors

`@m324/shared/errors` defines the domain errors. Throw those from the service
layer. The shared app shell (`createServiceApp`) is the only place that knows
about status codes, and it maps every error onto the same response envelope. A
service maps its own errors through `errorStatuses`, as `properties` does for
`LocationsServiceUnavailableError`:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { "name": ["..."] } } }
```

`details` is only present on a 400 and lists the problems per field or query
parameter, all at once rather than one per attempt.

| Error                              | Status |
| ---------------------------------- | ------ |
| `ValidationError`, malformed JSON  | 400    |
| `NotFoundError`                    | 404    |
| `ConflictError`                    | 409    |
| `LocationsServiceUnavailableError` | 502    |
| anything else                      | 500    |

## Adding a user story

1. Branch off `main` as `feat/<issue-id>-<description>`.
2. Define the table in `src/db/schema.ts`, then run `bun run --filter <service> db:generate`.
3. Write `repository.ts`, `service.ts` and `routes.ts` in the story's own folder.
   Validate requests with `jsonBody` and `pageQuery` from `@m324/shared/validation`.
4. Register the router in `src/app.ts` and add whatever it needs to `AppDependencies`.
5. Write at least two to three unit tests per endpoint covering happy and sad
   paths, documented with JSDoc as in the existing tests.
6. Open a pull request. It needs one review and green CI before it merges.

## Testing

Unit tests live in `test/` next to each service and the shared package, and run
with `bun test`. They must
not touch the network or the database. `test/app.test.ts` and
`test/locations-client.test.ts` show the pattern.

Integration tests live in `test/integration/` and run with `bun run test:integration`.
They require a real Postgres instance and the `INTEGRATION=1` environment variable
(plus `DATABASE_URL`); without it they are skipped, so `bun run test` never
touches a database. CI spins up a Postgres container, creates the roles via
`db/init/01-init.sh`, and migrates each service as its own role, which also
creates its schema. Only then does it run both integration suites with the
per-service credentials, since each one checks that it cannot reach the other
service's schema. The integration tests only delete rows they created
themselves.

## Deployment

Production runs on Render's free tier with Postgres on Neon.

| Environment | Where                                      | How it gets there                                |
| ----------- | ------------------------------------------ | ------------------------------------------------ |
| Dev         | your machine, Compose or `bun dev`         | by hand                                          |
| Production  | `m324-{locations,properties}.onrender.com` | every green push to `main`, through `deploy.yml` |

After CI passes on `main`, `.github/workflows/deploy.yml` deploys that commit of
both services with the Render CLI, then `scripts/smoke-test.sh` checks that
`/health` reports the new commit and `/health/ready` answers. If either step
fails, `scripts/deploy.sh` redeploys the commit that was live before.

To roll back by hand, run the **Deploy** workflow from the Actions tab with the
commit to go back to. `GET /health` shows which commit is live.

Each service applies its pending Drizzle migrations on startup, before it
listens. A migration must therefore stay compatible with the previous release,
because a rollback redeploys old code onto the new schema.

Startup gives migrations two minutes (`packages/shared/src/migrate.ts`). One that takes
longer is almost always waiting for a lock another session holds, such as a
database GUI or a `drizzle-kit` command left open against Neon. The service
then cancels its waiting statement and exits with a `MigrationTimeoutError`
naming the session that holds the lock, instead of hanging until Render gives
up with "no open ports detected". Close that session and redeploy.

Secrets live in Render (`DATABASE_URL`, `LOCATIONS_SERVICE_URL`) and in the
GitHub `production` environment (`RENDER_API_KEY`), never in the repository.
`db/neon-setup.sh` creates the service roles on a fresh Neon database.
