# Flow State Platform

The open-source app behind [flowstate.network](https://flowstate.network) — continuous funding apps, payment tools, and incentive systems powered by [Superfluid](https://superfluid.finance): Flow Councils, Flow Splitters, Flow QF, and more.

## Documentation

Full documentation lives at **[docs.flowstate.network](https://docs.flowstate.network)**:

- [User guide](https://docs.flowstate.network/) — how to use the platform
- [Developer docs](https://docs.flowstate.network/developers) — run, build, and contribute
- [Public API](https://docs.flowstate.network/developers/public-api) — unauthenticated endpoints for building on Flow State data
- [Concepts](https://docs.flowstate.network/concepts) — why streaming, glossary

The docs source lives in [`docs/`](./docs) in this repo and is the single source of truth — it's mirrored to the docs site on merge to `main`. Edit it here, not in the docs repo. See [Contributing](https://docs.flowstate.network/developers/contributing).

## Quick start

```bash
cp .env.sample .env
pnpm install
pnpm dev
```

The app runs at [http://localhost:3000](http://localhost:3000). See [Getting Started](https://docs.flowstate.network/developers/getting-started) for prerequisites, environment variables, and the database workflow.

## License

[MIT](./LICENSE)
