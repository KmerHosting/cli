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
