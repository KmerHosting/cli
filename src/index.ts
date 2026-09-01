#!/usr/bin/env node

import {
  KmerHostingClient,
  KmerHostingError,
  type ApiEnvelope,
  type KvmAction,
  type MutationOptions,
} from "@kmerhosting/sdk";

type ParsedArgs = {
  positionals: string[];
  flags: Map<string, string | true>;
};

type CliContext = {
  json: boolean;
  yes: boolean;
  mutationOptions: MutationOptions;
};

const VERSION = "0.3.0";
const DESTRUCTIVE_ACTIONS = new Set(["stop", "shutdown", "delete"]);

function help(): string {
  return `KmerHosting CLI ${VERSION}

Usage:
  kmerhosting <resource> <command> [arguments] [options]

Resources:
  account get                              Show the authenticated account
  account api-usage                        List API request activity and client IPv4s
  services list|view <id>                  List or inspect services
  domains list|view <id>                   List or inspect domains
  domains dns list <domain-id>             List DNS records
  domains dns create <domain-id>           Create a DNS record
  domains dns update <domain-id> <record> <json>
                                           Update a DNS record
  domains dns delete <domain-id> <record>  Delete a DNS record
  domains auto-renew <id> on|off           Change domain auto-renew
  domains nameservers <id> <ns...>         Replace domain nameservers
  email services                           List email hosting services
  email provision <service-id>            Provision an email service
  email dns-sync <service-id>              Synchronize email DNS
  hosting services                         List shared-hosting services
  hosting stats <service-id>               Show hosting statistics
  hosting panel-access <service-id>        Create a temporary panel link
  lxc list|view <id>                       List or inspect LXC instances
  lxc metrics <id>                         Show LXC metrics for the last 24 hours
  lxc action <id> start|stop|restart|freeze
  lxc snapshots list|create|delete|restore <id> [name]
  lxc password <id> <password>             Change the LXC root password
  lxc reinstall <id> <distribution>        Erase and reinstall an LXC instance
  lxc terminal-ticket <id>                 Create a 60-second terminal ticket
  lxc auto-renew <id> on|off               Change LXC auto-renew
  lxc billing-period <id> 1|3|6|12         Change the LXC billing period
  kvm list|view <id>                       List or inspect KVM instances
  kvm action <id> start|stop|shutdown|restart
  kvm auto-renew <id> on|off               Change KVM auto-renew
  kvm renew <id> [months]                  Renew a KVM instance
  kvm cancel|keep-service <id>             Schedule or revoke KVM cancellation
  kvm password <id> <password>              Reset KVM root password
  kvm snapshots list <id>                  List KVM snapshots
  kvm snapshots create <id> <name>         Create a KVM snapshot
  kvm snapshots update <id> <snapshot>     Update a KVM snapshot
  kvm snapshots delete <id> <snapshot>     Delete a KVM snapshot
  kvm snapshots rollback <id> <snapshot>   Roll back a KVM snapshot

Options:
  --json                                   Print machine-readable JSON
  --base-url <url>                         Override the API URL
  --idempotency-key <key>                 Reuse a mutation idempotency key
  --target panel|filemanager               Hosting panel-access target
  --yes                                    Confirm destructive operations
  --version                                Print the CLI version
  --help                                   Print this help

Authentication:
  Set KMERHOSTING_API_KEY in the environment.
`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  const valueFlags = new Set(["base-url", "idempotency-key", "target"]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const raw = argument.slice(2);
    if (raw.includes("=")) {
      const separator = raw.indexOf("=");
      flags.set(raw.slice(0, separator), raw.slice(separator + 1));
      continue;
    }
    if (valueFlags.has(raw)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Option --${raw} requires a value.`);
      flags.set(raw, value);
      index += 1;
      continue;
    }
    flags.set(raw, true);
  }

  return { positionals, flags };
}

function flag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true || args.flags.has(name);
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Missing ${label}.`);
  return value;
}

function context(args: ParsedArgs): CliContext {
  return {
    json: hasFlag(args, "json"),
    yes: hasFlag(args, "yes"),
    mutationOptions: {
      idempotencyKey: flag(args, "idempotency-key"),
    },
  };
}

function createClient(args: ParsedArgs): KmerHostingClient {
  return new KmerHostingClient({
    apiKey: process.env.KMERHOSTING_API_KEY,
    baseUrl: flag(args, "base-url") ?? process.env.KMERHOSTING_API_URL,
  });
}

function parseJson(value: string, label: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} must be a JSON object.`);
  }
}

function confirmDestructive(action: string, id: string, ctx: CliContext): void {
  if (ctx.yes) return;
  throw new Error(`Refusing destructive action "${action}" for ${id}. Re-run with --yes.`);
}

function dataOf(result: ApiEnvelope): unknown {
  return result.data;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function printHuman(value: unknown): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      console.log("No results.");
      return;
    }
    if (value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      const rows = value as Record<string, unknown>[];
      const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 8);
      const widths = keys.map((key) => Math.min(32, Math.max(key.length, ...rows.map((row) => formatValue(row[key]).length))));
      console.log(keys.map((key, index) => key.padEnd(widths[index])).join("  "));
      console.log(keys.map((_, index) => "-".repeat(widths[index])).join("  "));
      for (const row of rows) console.log(keys.map((key, index) => formatValue(row[key]).slice(0, 32).padEnd(widths[index])).join("  "));
      return;
    }
    for (const item of value) console.log(formatValue(item));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) console.log(`${key}: ${formatValue(entry)}`);
    return;
  }
  console.log(formatValue(value));
}

function output(result: ApiEnvelope, ctx: CliContext): void {
  if (ctx.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(dataOf(result));
}

async function run(args: ParsedArgs): Promise<void> {
  const [resource, command, ...rest] = args.positionals;
  const client = createClient(args);
  const ctx = context(args);
  let result: ApiEnvelope;

  if (resource === "account" && command === "get") result = await client.account.get();
  else if (resource === "account" && command === "api-usage") result = await client.account.apiUsage();
  else if (resource === "services" && command === "list") result = await client.services.list();
  else if (resource === "services" && (command === "view" || command === "get")) result = await client.services.get(required(rest[0], "service id"));
  else if (resource === "domains" && command === "list") result = await client.domains.list();
  else if (resource === "domains" && (command === "view" || command === "get")) result = await client.domains.get(required(rest[0], "domain id"));
  else if (resource === "domains" && command === "dns") result = await runDomainDns(client, rest, ctx);
  else if (resource === "domains" && command === "auto-renew") {
    const id = required(rest[0], "domain id");
    const state = required(rest[1], "on or off");
    if (state !== "on" && state !== "off") throw new Error("Domain auto-renew must be on or off.");
    result = await client.domains.setAutoRenew(id, state === "on", ctx.mutationOptions);
  } else if (resource === "domains" && command === "nameservers") {
    const id = required(rest[0], "domain id");
    const servers = rest.slice(1);
    if (servers.length === 0) throw new Error("Provide at least one nameserver.");
    result = await client.domains.setNameservers(id, servers, ctx.mutationOptions);
  } else if (resource === "email" && command === "services") result = await client.email.listServices();
  else if (resource === "email" && command === "provision") result = await client.email.provision(required(rest[0], "email service id"), ctx.mutationOptions);
  else if (resource === "email" && command === "dns-sync") result = await client.email.syncDns(required(rest[0], "email service id"), ctx.mutationOptions);
  else if (resource === "hosting" && command === "services") result = await client.hosting.listServices();
  else if (resource === "hosting" && command === "stats") result = await client.hosting.stats(required(rest[0], "hosting service id"));
  else if (resource === "hosting" && command === "panel-access") {
    const target = flag(args, "target") as "panel" | "filemanager" | undefined;
    if (target && target !== "panel" && target !== "filemanager") throw new Error("--target must be panel or filemanager.");
    result = await client.hosting.createPanelAccess(required(rest[0], "hosting service id"), target, ctx.mutationOptions);
  } else if (resource === "lxc" && command === "list") result = await client.lxc.list();
  else if (resource === "lxc" && (command === "view" || command === "get")) result = await client.lxc.get(required(rest[0], "LXC instance id"));
  else if (resource === "lxc" && command === "metrics") result = await client.lxc.metrics(required(rest[0], "LXC instance id"));
  else if (resource === "lxc" && command === "action") {
    const action = required(rest[1], "LXC action") as "start" | "stop" | "restart" | "freeze";
    if (!["start", "stop", "restart", "freeze"].includes(action)) throw new Error("LXC action must be start, stop, restart, or freeze.");
    if (DESTRUCTIVE_ACTIONS.has(action)) confirmDestructive(action, required(rest[0], "LXC instance id"), ctx);
    result = await client.lxc.action(required(rest[0], "LXC instance id"), action, ctx.mutationOptions);
  } else if (resource === "lxc" && command === "snapshots") {
    const snapshotCommand = required(rest[0], "snapshot command");
    const id = required(rest[1], "LXC instance id");
    if (snapshotCommand === "list") result = await client.lxc.snapshots.list(id);
    else { const name = required(rest[2], "snapshot name"); if (snapshotCommand === "delete" || snapshotCommand === "restore") confirmDestructive(`snapshot ${snapshotCommand}`, name, ctx); if (!["create", "delete", "restore"].includes(snapshotCommand)) throw new Error("Snapshot command must be list, create, delete, or restore."); result = await client.lxc.snapshots.mutate(id, snapshotCommand as "create" | "delete" | "restore", name, ctx.mutationOptions); }
  } else if (resource === "lxc" && command === "password") {
    const id = required(rest[0], "LXC instance id");
    confirmDestructive("change LXC root password", id, ctx);
    result = await client.lxc.changePassword(id, required(rest[1], "new root password"), ctx.mutationOptions);
  } else if (resource === "lxc" && command === "reinstall") {
    const id = required(rest[0], "LXC instance id");
    confirmDestructive("erase and reinstall LXC instance", id, ctx);
    result = await client.lxc.reinstall(id, required(rest[1], "distribution"), ctx.mutationOptions);
  } else if (resource === "lxc" && command === "terminal-ticket") {
    const id = required(rest[0], "LXC instance id");
    confirmDestructive("issue LXC terminal access", id, ctx);
    result = await client.lxc.createTerminalTicket(id, ctx.mutationOptions);
  } else if (resource === "lxc" && command === "auto-renew") {
    const id = required(rest[0], "LXC instance id");
    const state = required(rest[1], "on or off");
    if (state !== "on" && state !== "off") throw new Error("LXC auto-renew must be on or off.");
    if (state === "off") confirmDestructive("disable LXC auto-renew", id, ctx);
    result = await client.lxc.setAutoRenew(id, state === "on", ctx.mutationOptions);
  } else if (resource === "lxc" && command === "billing-period") {
    const id = required(rest[0], "LXC instance id");
    const billingMonths = Number(required(rest[1], "billing period"));
    if (![1, 3, 6, 12].includes(billingMonths)) throw new Error("LXC billing period must be 1, 3, 6, or 12 months.");
    result = await client.lxc.setBillingPeriod(id, billingMonths as 1 | 3 | 6 | 12, ctx.mutationOptions);
  }
  else if (resource === "kvm" && command === "list") result = await client.kvm.list();
  else if (resource === "kvm" && (command === "view" || command === "get")) result = await client.kvm.get(required(rest[0], "KVM instance id"));
  else if (resource === "kvm" && command === "action") {
    const id = required(rest[0], "KVM instance id");
    const action = required(rest[1], "KVM action") as KvmAction;
    if (!["start", "stop", "shutdown", "restart"].includes(action)) throw new Error("KVM action must be start, stop, shutdown, or restart.");
    if (DESTRUCTIVE_ACTIONS.has(action)) confirmDestructive(action, id, ctx);
    result = await client.kvm.action(id, action, ctx.mutationOptions);
  } else if (resource === "kvm" && command === "auto-renew") {
    const id = required(rest[0], "KVM instance id");
    const state = required(rest[1], "on or off");
    if (state !== "on" && state !== "off") throw new Error("KVM auto-renew must be on or off.");
    result = await client.kvm.setAutoRenew(id, state === "on", ctx.mutationOptions);
  } else if (resource === "kvm" && ["renew", "cancel", "keep-service", "password"].includes(command || "")) {
    const id = required(rest[0], "KVM instance id");
    const kvm = client.kvm as typeof client.kvm & { renew?: (id: string, months?: 1 | 3 | 6 | 12, options?: MutationOptions) => Promise<ApiEnvelope>; cancel?: (id: string, options?: MutationOptions) => Promise<ApiEnvelope>; keepService?: (id: string, options?: MutationOptions) => Promise<ApiEnvelope>; resetPassword?: (id: string, password: string, options?: MutationOptions) => Promise<ApiEnvelope> };
    if (command === "renew") { if (!kvm.renew) throw new Error("Install the latest KmerHosting SDK before using KVM renewal."); const months = rest[1] ? Number(rest[1]) as 1 | 3 | 6 | 12 : undefined; result = await kvm.renew(id, months, ctx.mutationOptions); }
    else if (command === "cancel") { confirmDestructive("cancel KVM service", id, ctx); if (!kvm.cancel) throw new Error("Install the latest KmerHosting SDK before using KVM cancellation."); result = await kvm.cancel(id, ctx.mutationOptions); }
    else if (command === "keep-service") { if (!kvm.keepService) throw new Error("Install the latest KmerHosting SDK before using KVM recovery."); result = await kvm.keepService(id, ctx.mutationOptions); }
    else { confirmDestructive("reset KVM root password", id, ctx); if (!kvm.resetPassword) throw new Error("Install the latest KmerHosting SDK before using KVM password reset."); result = await kvm.resetPassword(id, required(rest[1], "new root password"), ctx.mutationOptions); }
  } else if (resource === "kvm" && command === "snapshots") result = await runKvmSnapshots(client, rest, ctx);
  else if (resource === "vps") throw new Error("The `vps` resource was retired. Use `lxc` for LXC inventory or `kvm` for KVM management.");
  else throw new Error("Unknown command. Run `kmerhosting --help` for usage.");

  output(result, ctx);
}

async function runDomainDns(client: KmerHostingClient, args: string[], ctx: CliContext): Promise<ApiEnvelope> {
  const [command, domainId, extra] = args;
  const id = required(domainId, "domain id");
  if (command === "list") return client.domains.dns.list(id);
  if (command === "create") return client.domains.dns.create(id, parseJson(required(extra, "DNS record JSON"), "DNS record"), ctx.mutationOptions);
  if (command === "update") {
    const recordId = required(extra, "DNS record id");
    const payload = args[3];
    return client.domains.dns.update(id, recordId, parseJson(required(payload, "DNS record JSON"), "DNS record"), ctx.mutationOptions);
  }
  if (command === "delete") {
    const recordId = required(extra, "DNS record id");
    confirmDestructive("delete DNS record", recordId, ctx);
    return client.domains.dns.delete(id, recordId, ctx.mutationOptions);
  }
  throw new Error("Unknown domains dns command.");
}

async function runKvmSnapshots(client: KmerHostingClient, args: string[], ctx: CliContext): Promise<ApiEnvelope> {
  const [command, serviceId, extra] = args;
  const id = required(serviceId, "KVM instance id");
  if (command === "list") return client.kvm.snapshots.list(id);
  if (command === "create") return client.kvm.snapshots.create(id, { name: required(extra, "snapshot name"), description: args[3] }, ctx.mutationOptions);
  if (command === "update") return client.kvm.snapshots.update(id, required(extra, "snapshot id"), { name: args[3], description: args[4] }, ctx.mutationOptions);
  if (command === "delete") {
    const snapshotId = required(extra, "snapshot id");
    confirmDestructive("delete snapshot", snapshotId, ctx);
    return client.kvm.snapshots.delete(id, snapshotId, ctx.mutationOptions);
  }
  if (command === "rollback") {
    const snapshotId = required(extra, "snapshot id");
    confirmDestructive("rollback snapshot", snapshotId, ctx);
    return client.kvm.snapshots.rollback(id, snapshotId, ctx.mutationOptions);
  }
  throw new Error("Unknown kvm snapshots command.");
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (hasFlag(args, "version")) {
      console.log(VERSION);
      return 0;
    }
    if (hasFlag(args, "help") || args.positionals.length === 0) {
      console.log(help());
      return 0;
    }
    await run(args);
    return 0;
  } catch (error) {
    if (error instanceof KmerHostingError) {
      console.error(`Error: ${error.message} (${error.code}, HTTP ${error.status})`);
      if (error.requestId) console.error(`Request ID: ${error.requestId}`);
    } else console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main());
