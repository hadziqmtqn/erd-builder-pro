<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/img/ERD-Builder-Pro-Light.svg" />
    <source media="(prefers-color-scheme: light)" srcset="public/img/ERD-Builder-Pro-Dark.svg" />
    <img width="400" alt="ERD Builder Pro" src="public/img/ERD-Builder-Pro-Light.svg" />
  </picture>
</div>

<h1 align="center">ERD Builder Pro</h1>
<p align="center">Design database schemas and document how your systems work.</p>

<p align="center">
  <a href="https://hub.docker.com/r/bekenweb/erd-builder-pro">
    <img alt="Docker Hub" src="https://img.shields.io/badge/docker-available-blue?logo=docker" />
  </a>
  <a href="https://hub.docker.com/r/bekenweb/erd-builder-pro">
    <img alt="Docker pulls" src="https://img.shields.io/docker/pulls/bekenweb/erd-builder-pro" />
  </a>
  <a href="https://hub.docker.com/r/bekenweb/erd-builder-pro/tags">
    <img alt="Docker image size" src="https://img.shields.io/docker/image-size/bekenweb/erd-builder-pro/latest" />
  </a>
</p>

<p align="center">
  <a href="https://docs.erdbuilderpro.com">Documentation</a> ·
  <a href="https://github.com/hadziqmtqn/erd-builder-pro/releases">Desktop releases</a> ·
  <a href="https://hub.docker.com/r/bekenweb/erd-builder-pro">Docker image</a>
</p>

<div align="center">
  <img width="1100" alt="ERD Builder Pro workspace" src="public/img/erd-intro.gif" />
</div>

ERD Builder Pro combines an ERD canvas and DBML editor with flowcharts, notes, and drawings. Desktop and CLI builds also include DB Client for working with existing PostgreSQL, MySQL, and SQLite databases.

## Features

- Model schemas in the ERD canvas or DBML editor, then export SQL DDL for PostgreSQL and MySQL.
- Keep flowcharts, rich-text notes, and drawings alongside project files.
- Use DB Client in the Desktop and CLI apps to inspect connected database schemas, browse data, and run queries.
- Ask the AI assistant to draft SQL, sample data, or flowcharts. Review generated content before applying it. AI features require a configured provider.

## Install

### CLI

Requires Node.js 18 or later.

```bash
npm install -g erdbpro
erdbpro start --open
```

The CLI opens the web interface at `http://localhost:3101`, binds its server to `127.0.0.1`, and stores its SQLite database at `~/.erdbpro/data.db`. See the [CLI guide](./cli/README.md) for other commands, MCP, and schema checks.

### Desktop

Download a macOS, Windows, or Linux build from [GitHub Releases](https://github.com/hadziqmtqn/erd-builder-pro/releases). macOS and Windows builds are not registered with Apple or Microsoft, so Gatekeeper or SmartScreen may show a warning on first launch. Check the release notes for installation instructions.

### Docker

The published image listens on port `3000` and uses SQLite when `DATABASE_URL` is unset. The database is stored under `/app/data`; mount that path to a persistent volume. Web deployments also require a stable `ERD_ENCRYPTION_KEY`.

Generate a key once with `openssl rand -hex 32`. Save the result in an untracked `.env` file as `ERD_ENCRYPTION_KEY=<generated-value>`. Leave `DATABASE_URL` unset for the default SQLite setup. Keep the same key when restarting or replacing the container; changing it can make previously encrypted values unreadable.

```bash
docker run -d \
  --name erd-builder-pro \
  --restart unless-stopped \
  --publish 3000:3000 \
  --volume erd-data:/app/data \
  --env-file .env \
  bekenweb/erd-builder-pro:latest
```

Keep the `erd-data` volume and `.env` backed up. Removing the volume deletes the SQLite database. PostgreSQL and Supabase deployments need additional environment settings; see [`.env.example`](./.env.example).

## MCP support (experimental)

Run `erdbpro mcp` to use CLI data or `erdbpro mcp --desktop` to use Desktop data. The Desktop command runs the bundled MCP server without opening another GUI window. Local MCP includes selected write operations for Notes and history, so review those requests before approving them.

A configured Web deployment can expose an OAuth-protected Streamable HTTP endpoint. The Web MCP surface is read-only and limited to workspace documents and history. It does not expose DB Client data, credentials, SQL execution, filesystem access, or write operations. See the [MCP setup guide](https://docs.erdbuilderpro.com/configuration/mcp).

## Development

For local PostgreSQL development, set `DATABASE_URL` in `.env` to a development database, then run:

```bash
npm install
npm run dev:pg:local
```

`dev:pg:local` pushes the Prisma schema before starting the server. Do not point it at production data. Run the checks with:

```bash
npm test
npm run lint
```

## License

This repository uses the [PolyForm Noncommercial License 1.0.0](./LICENSE). It does not grant commercial-use rights, including internal use by for-profit organizations. Contact the licensor for separate permission before commercial use.

## Sponsors

<p align="center">
  <a href="https://www.idcloudhost.com"><img src="./public/img/sponsors/IDCloudhost.png" alt="IDCloudhost" height="50" /></a>
  &nbsp;&nbsp;
  <a href="https://doktainer.com"><img src="./public/img/sponsors/Doktainer.png" alt="Doktainer" height="50" /></a>
  &nbsp;&nbsp;
  <a href="https://sumopod.com"><img src="./public/img/sponsors/Sumopod.png" alt="SumoPod" height="50" /></a>
</p>

Support development through [Trakteer](https://trakteer.id/khadziq_muttaqin/tip).
