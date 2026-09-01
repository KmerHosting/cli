# KmerHosting CLI

Official command-line interface for the KmerHosting API.

## Install

```bash
# Install from the official GitHub repository:
bun add --global github:KmerHosting/cli
```

On Windows PowerShell, if Bun warns that `C:\Users\<you>\.bun\bin` is not in `PATH`, enable it for the current terminal with:

```powershell
$env:Path = "$HOME\.bun\bin;$env:Path"
```

If a previous GitHub install still points at an older commit, refresh it once:

```powershell
bun remove --global @kmerhosting/cli
bun add --global github:KmerHosting/cli
$env:Path = "$HOME\.bun\bin;$env:Path"
kmerhosting --help
```

Set your API key in the environment:

```bash
export KMERHOSTING_API_KEY='kh_live_...'
```

For a staging or self-hosted API, set `KMERHOSTING_API_URL` or pass `--base-url`.

## Quick start

```bash
kmerhosting account get
kmerhosting account api-usage
kmerhosting services list
kmerhosting domains list --json
kmerhosting lxc list
kmerhosting lxc metrics INSTANCE_ID
kmerhosting kvm action INSTANCE_ID restart
```

Mutations receive an idempotency key automatically. Reuse one when retrying the same operation:

```bash
kmerhosting kvm action INSTANCE_ID restart --idempotency-key deploy-2026-08-30
```

Destructive operations require an explicit `--yes` confirmation. DNS records and snapshot payloads are JSON objects:

```bash
kmerhosting domains dns create DOMAIN_ID '{"type":"A","name":"@","content":"203.0.113.10","ttl":300}'
kmerhosting kvm snapshots create INSTANCE_ID before-upgrade
kmerhosting lxc reinstall INSTANCE_ID ubuntu-24.04 --yes
```

Run `kmerhosting --help` for the complete command list. Use `--json` for scripts and CI.

LXC and KVM are separate resources. LXC supports inventory, metrics, power, snapshots, password changes, reinstallations, short-lived terminal tickets and subscription settings. KVM supports inventory, power, credentials, renewals, cancellation recovery and the full snapshot lifecycle. The former `vps` command returns an actionable migration error instead of guessing which product you intended.

## Security

The CLI uses the same customer API key as the official SDK. Keep it out of source control, browser code, shell history and logs. Prefer an environment variable or a secret manager. Dangerous scopes are restricted to the IPv4 addresses selected when the key is created, and destructive CLI commands additionally require `--yes`.

## License

Apache-2.0. KmerHosting trademarks are not granted by the license.
