import * as assert from "assert";
import { shouldSuggestPrivateKeyRetry } from "../extension";

suite("Private Key Retry Decision", () => {
  test("returns false for successful exit", () => {
    assert.strictEqual(
      shouldSuggestPrivateKeyRetry(0, "Permission denied (publickey)."),
      false
    );
  });

  test("returns true for publickey auth failure", () => {
    assert.strictEqual(
      shouldSuggestPrivateKeyRetry(255, "Permission denied (publickey)."),
      true
    );
  });

  test("returns false for unrelated failure text", () => {
    assert.strictEqual(
      shouldSuggestPrivateKeyRetry(255, "Could not resolve hostname example.invalid"),
      false
    );
  });
});
