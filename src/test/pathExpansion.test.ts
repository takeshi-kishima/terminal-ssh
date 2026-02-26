import * as assert from "assert";
import * as os from "os";
import * as path from "path";
import { expandPathPlaceholders } from "../extension";

suite("Path Expansion", () => {
  test("expands tilde path", () => {
    const expanded = expandPathPlaceholders("~/.ssh/id_ed25519");
    assert.strictEqual(expanded, path.resolve(path.join(os.homedir(), ".ssh", "id_ed25519")));
  });

  test("expands ${env:NAME} placeholder", () => {
    process.env.TERMINAL_SSH_TEST_HOME = "C:\\test-home";
    const expanded = expandPathPlaceholders("${env:TERMINAL_SSH_TEST_HOME}\\.ssh\\id_rsa");
    assert.strictEqual(expanded, path.resolve("C:\\test-home\\.ssh\\id_rsa"));
  });

  test("expands %NAME% placeholder", () => {
    process.env.TERMINAL_SSH_TEST_WIN = "C:\\win-home";
    const expanded = expandPathPlaceholders("%TERMINAL_SSH_TEST_WIN%\\.ssh\\id_rsa");
    assert.strictEqual(expanded, path.resolve("C:\\win-home\\.ssh\\id_rsa"));
  });
});
