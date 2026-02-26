import * as assert from "assert";
import { buildSshArgs } from "../sshTerminal";

suite("SSH Args Builder", () => {
  test("adds -i and IdentitiesOnly when private key is provided", () => {
    const args = buildSshArgs("user@example.com", false, undefined, "~/.ssh/id_rsa");
    assert.ok(args.includes("-i"));
    assert.ok(args.includes("IdentitiesOnly=yes"));
    assert.strictEqual(args[args.length - 1], "user@example.com");
  });

  test("does not add -i when private key is empty", () => {
    const args = buildSshArgs("user@example.com", false, undefined, "");
    assert.ok(!args.includes("-i"));
    assert.ok(!args.includes("IdentitiesOnly=yes"));
  });

  test("keeps config-based connection behavior", () => {
    const args = buildSshArgs("alias-host", true, "C:\\tmp\\config");
    assert.ok(args.includes("-F"));
    assert.ok(!args.includes("-i"));
    assert.strictEqual(args[args.length - 1], "alias-host");
  });
});
