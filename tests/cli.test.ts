import { expect, test } from "bun:test";
import { main } from "../src/index";

test("prints help without credentials", async () => {
  const original = console.log;
  let output = "";
  console.log = (...values: unknown[]) => { output += values.join(" "); };
  try {
    expect(await main(["--help"])).toBe(0);
    expect(output).toContain("KmerHosting CLI");
    expect(output).toContain("KMERHOSTING_API_KEY");
    expect(output).toContain("lxc reinstall");
    expect(output).toContain("kvm snapshots rollback");
  } finally {
    console.log = original;
  }
});

test("rejects destructive actions without --yes before making a request", async () => {
  const original = console.error;
  let output = "";
  console.error = (...values: unknown[]) => { output += values.join(" "); };
  try {
    process.env.KMERHOSTING_API_KEY = "kh_test";
    expect(await main(["kvm", "action", "vps-1", "stop"])).toBe(1);
    expect(output).toContain("--yes");
  } finally {
    console.error = original;
    delete process.env.KMERHOSTING_API_KEY;
  }
});

test("explains how to migrate the retired vps resource", async () => {
  const original = console.error;
  let output = "";
  console.error = (...values: unknown[]) => { output += values.join(" "); };
  try {
    process.env.KMERHOSTING_API_KEY = "kh_test";
    expect(await main(["vps", "list"])).toBe(1);
    expect(output).toContain("Use `lxc`");
    expect(output).toContain("`kvm`");
  } finally {
    console.error = original;
    delete process.env.KMERHOSTING_API_KEY;
  }
});

test("searches domains through the public service without an API key", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const seen: string[] = [];
  let output = "";
  delete process.env.KMERHOSTING_API_KEY;
  process.env.KMERHOSTING_DOMAIN_SEARCH_URL = "https://domain.example.test/";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(`${String(input)} auth=${new Headers(init?.headers).has("Authorization")}`);
    return Response.json({ results: [{ domainName: "example.com", registrar: { status: "available" }, price: { registration_price_usd: 12.5, renewal_price_usd: 14 } }] });
  }) as typeof fetch;
  console.log = (...values: unknown[]) => { output += values.join(" ") + "\n"; };
  try {
    expect(await main(["domains", "search", "example.com", "example.cm"])).toBe(0);
    expect(seen).toEqual(["https://domain.example.test/api/domain-search?domains=example.com%2Cexample.cm auth=false"]);
    expect(output).toContain("example.com");
    expect(output).toContain("available");
    output = "";
    expect(await main(["domains", "search", "example.com", "--json"])).toBe(0);
    expect(JSON.parse(output).results[0].domainName).toBe("example.com");
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    delete process.env.KMERHOSTING_DOMAIN_SEARCH_URL;
  }
});

test("reports a domain search rate limit with the retry delay", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let output = "";
  globalThis.fetch = (async () => Response.json({ error: "search_rate_limited", message: "Too many searches." }, { status: 429, headers: { "Retry-After": "12" } })) as unknown as typeof fetch;
  console.error = (...values: unknown[]) => { output += values.join(" "); };
  try {
    expect(await main(["domains", "search", "example.com"])).toBe(1);
    expect(output).toContain("search_rate_limited");
    expect(output).toContain("12s");
    expect(await main(["domains", "search"])).toBe(1);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});
