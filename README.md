# KmerHosting CLI

Official command-line interface for the KmerHosting API.

## Install

```bash
bun add -g @kmerhosting/cli
```

Set your API key in the environment:

```bash
export KMERHOSTING_API_KEY='kh_live_...'
```

For a staging or self-hosted API, set `KMERHOSTING_API_URL` or pass `--base-url`.

## Quick start

```bash
kmerhosting account get
kmerhosting services list
kmerhosting domains list --json
kmerhosting vps action INSTANCE_ID restart
```

Mutations receive an idempotency key automatically. Reuse one when retrying the same operation:

```bash
kmerhosting vps action INSTANCE_ID restart --idempotency-key deploy-2026-08-30
```

Destructive operations require an explicit `--yes` confirmation. DNS records and snapshot payloads are JSON objects:

```bash
kmerhosting domains dns create DOMAIN_ID '{"type":"A","name":"@","content":"203.0.113.10","ttl":300}'
kmerhosting vps snapshots create INSTANCE_ID before-upgrade
```

Run `kmerhosting --help` for the complete command list. Use `--json` for scripts and CI.

## Security

The CLI uses the same customer API key as the official SDK. Keep it out of source control, browser code, shell history and logs. Prefer an environment variable or a secret manager.

## License

Apache-2.0. KmerHosting trademarks are not granted by the license.
