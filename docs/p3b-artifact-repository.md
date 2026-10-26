# P3b: Artifact Repository

## Artifact Type and Registry

**Artifact type:** one OCI container image per microservice (`locations`, `properties`).

Our services are Bun/TypeScript programs with no build step, so there is no compiled
binary or npm package worth publishing on its own. The deployable unit is the container
image: it contains the runtime, the production dependencies and the source, and it is
exactly what `docker compose` and any later deployment target run. An npm package would
still need a runtime and an install step on the target, and the services are never
imported as libraries.

- **Source code:** the git repository (`services/*`).
- **Build artifact:** the image produced by `docker build` in CI.
- **Deployment artifact:** the same image once it is tagged with a release version and
  stored in the registry, so every environment pulls the identical bytes.

**Registry:** GitHub Container Registry (GHCR, `ghcr.io`).

| Option                    | Why (not)                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **GHCR** ✅               | Code, CI and issues are already on GitHub. Auth via the built-in `GITHUB_TOKEN`, no extra account or long-lived secret. |
| Docker Hub                | Separate account and a manually rotated access token stored as a repository secret; rate limits on the free tier.       |
| GitLab Container Registry | Would split the project across two platforms.                                                                           |
| npm / GitHub Packages npm | Wrong artifact type, see above.                                                                                         |

## Naming Convention

```
ghcr.io/cuerillius/m324-group-2/<service>:<tag>
```

- Namespace = repository (`cuerillius/m324-group-2`), so both images are grouped under
  the project. GHCR requires lowercase, hence `cuerillius`.
- One image name per service, matching the directory name in `services/`.

## Versioning and Tags

We use SemVer (`vMAJOR.MINOR.PATCH`). A release is created by pushing a git tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Each publish pushes three tags per image:

| Tag            | Example                   | Purpose                                                                                    |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `<version>`    | `v1.0.0`                  | Release version. Never reused; this is what deployments pin.                               |
| `sha-<commit>` | `sha-9d6f8a6…` (full SHA) | Traces the image back to the exact commit, independent of the git tag.                     |
| `latest`       | `latest`                  | Convenience for local testing only. Moves with every release, never pinned in deployments. |

In addition, the image carries OCI labels (`org.opencontainers.image.source`,
`.revision`, `.version`), and the pipeline prints the image **digest**
(`sha256:…`). The digest is the only truly immutable reference: tags can be moved,
the digest cannot.

## CI Pipeline Extension

The workflow `.github/workflows/ci.yml` has these jobs:

```
verify  (format, lint, typecheck, unit + integration tests) ─┐   ┌─► deploy  (P4, only on push to main)
docker  (build check for both images)                        ├───┤
                                                             ┘   └─► publish (P3b, only on v* tags)
```

Changes for P3b:

- The workflow trigger now also includes `push: tags: ['v*']`. Before, it only ran on
  pushes to `main` and on pull requests, so a tag push would not have started the
  pipeline at all.
- New job `publish`:
  - `needs: [verify, docker]` – it only runs if every build and test step succeeded.
  - `if: github.ref_type == 'tag' && startsWith(github.ref_name, 'v')` – never on
    branch pushes or PRs.
  - Matrix over `locations` and `properties`, so both images are published in parallel.
  - Logs in to GHCR, builds with OCI labels, pushes `<version>`, `sha-<commit>` and
    `latest`.
  - Prints the published references and the digest in the log and in the job summary
    (visible on the run page under "Summary").

The existing P3 jobs (`verify`, `docker`) and the P4 `deploy` job are unchanged.

## Access, Permissions and Secrets

- **Pushing:** only the `publish` job, authenticated with `secrets.GITHUB_TOKEN`. GitHub
  creates this token per run and it expires when the job ends, so there is no
  long-lived credential to leak or rotate. No personal access token is stored anywhere.
- **Least privilege:** the job requests only `contents: read` and `packages: write`.
  The `verify` and `docker` jobs get no package permissions.
- **Who can trigger a publish:** only people with write access to the repository can
  push tags. Pull requests from forks never run `publish` (not a tag ref, and fork PRs
  get a read-only token).
- **Package visibility:** GHCR creates a new package as **private**, even for a public
  repository. Because the image carries the `org.opencontainers.image.source` label,
  GHCR links the package to the repository, and repository collaborators inherit access.
  After the first publish we set each package to public under
  _Package settings → Change visibility_ so P4 can pull without credentials.
- **Pulling a private package** (if we keep it private): `docker login ghcr.io` with a
  personal access token that only has `read:packages`, stored as a secret on the
  deployment side, never in the repository or in documentation.
- The images contain no secrets: `.env` is in `.dockerignore`, and `DATABASE_URL` etc.
  are injected at runtime via environment variables.

## Proof of Published Artifact

> TODO after the first tag push – fill in:
>
> - Pipeline run: `https://github.com/Cuerillius/m324-group-2/actions/runs/<id>`
> - Packages: `https://github.com/Cuerillius/m324-group-2/pkgs/container/m324-group-2%2Flocations`
>   and `…%2Fproperties`
> - Screenshot of the job summary with tags and digest
> - Screenshot of the package page showing the tags

## Use in P4 (Deployment / Release)

**Current state:** the P4 `deploy` job (`.github/workflows/deploy.yml`) runs after
every green push to `main` and tells Render to deploy a commit. Render then builds
the image itself from the Dockerfile. So production runs the same _source_ as CI
tested, but not the same _image_.

**With the published artifact:** releases (`v*` tags) are built once in CI and
pushed to GHCR. The next step for P4 is to switch the Render services to
image-backed services that pull `ghcr.io/cuerillius/m324-group-2/<service>:<version>`
instead of building from git. Then the tested image is exactly the deployed image,
and a rollback is just deploying an older tag.

For a test environment, the images can already be used today. In
`docker-compose.yml`, `build:` is replaced by `image:` with a pinned version:

```yaml
locations:
  image: ghcr.io/cuerillius/m324-group-2/locations:${APP_VERSION}
properties:
  image: ghcr.io/cuerillius/m324-group-2/properties:${APP_VERSION}
```

```bash
APP_VERSION=v1.0.0 docker compose --profile app pull
APP_VERSION=v1.0.0 docker compose --profile app up -d
```

- **Release:** the `deploy` job could run on `v*` tags with `needs: publish` and
  deploy the image tag instead of the commit.
- **Rollback:** redeploy with the previous version, e.g. `APP_VERSION=v0.9.0`. No
  rebuild is needed, the old image is still in the registry.
- **Reproducibility:** for maximum safety, pin the digest
  (`locations@sha256:…`) instead of the tag.

## AI Review

**Prompt (to Claude Code):** "Please do this task: [P3b assignment]" – with our
existing draft of the `publish` job and this document in the repository.

**AI findings:**

1. The workflow only triggered on `push: branches: [main]` and `pull_request`. A tag
   push would never start the pipeline, so the `publish` job could never run, even
   though its `if:` condition looked correct.
2. The document claimed the images are public. GHCR creates new packages as private.
3. Only `<version>` and `latest` were pushed; there was no direct link from image to
   commit. Suggested an `sha-<commit>` tag, OCI labels and printing the digest.

**Checked locations:** `on:` block and `publish` job in `.github/workflows/ci.yml`;
GHCR package visibility settings.

**Result:** added `tags: ['v*']` to the trigger, the SHA tag, OCI labels, digest output
and job summary; corrected the visibility section. The workflow was checked with
`actionlint` (no errors) and `prettier --check`.

**Own conclusion:** _TODO – write in your own words (required by the assignment)._
