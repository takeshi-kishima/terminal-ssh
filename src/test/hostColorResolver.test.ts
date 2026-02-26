import * as assert from "assert";
import { resolveTerminalColors } from "../hostColorResolver";

suite("Host Color Resolver", () => {
  const defaultColors = {
    foreground: "#f0f0f0",
    background: "#1e1e1e",
  };

  const hostColors = {
    "omni-sakura": { foreground: "red", background: "#4169e1" },
    "49.212.130.181": { foreground: "yellow", background: "#1b1f23" },
    "ubuntu@49.212.130.181": { foreground: "#f8f8f2", background: "#1b1f23" },
  };

  test("1) targetHost exact match is used first", () => {
    const result = resolveTerminalColors({
      targetHost: "omni-sakura",
      isFromConfigFile: true,
      defaultColorsInput: defaultColors,
      hostColorsMap: hostColors,
      resolvedHostName: "49.212.130.181",
      resolvedUser: "ubuntu",
    });

    assert.deepStrictEqual(result, hostColors["omni-sakura"]);
  });

  test("2) host part of user@host is used", () => {
    const result = resolveTerminalColors({
      targetHost: "ubuntu@49.212.130.181",
      isFromConfigFile: false,
      defaultColorsInput: defaultColors,
      hostColorsMap: {
        "49.212.130.181": hostColors["49.212.130.181"],
      },
    });

    assert.deepStrictEqual(result, hostColors["49.212.130.181"]);
  });

  test("3) HostName is used when selected from SSH config alias", () => {
    const result = resolveTerminalColors({
      targetHost: "omni-sakura",
      isFromConfigFile: true,
      defaultColorsInput: defaultColors,
      hostColorsMap: {
        "49.212.130.181": hostColors["49.212.130.181"],
      },
      resolvedHostName: "49.212.130.181",
      resolvedUser: "ubuntu",
    });

    assert.deepStrictEqual(result, hostColors["49.212.130.181"]);
  });

  test("4) User@HostName is used when HostName key does not exist", () => {
    const expected = hostColors["ubuntu@49.212.130.181"];
    const result = resolveTerminalColors({
      targetHost: "omni-sakura",
      isFromConfigFile: true,
      defaultColorsInput: defaultColors,
      hostColorsMap: {
        "ubuntu@49.212.130.181": expected,
      },
      resolvedHostName: "49.212.130.181",
      resolvedUser: "ubuntu",
    });

    assert.deepStrictEqual(result, expected);
  });

  test("5) defaultColors is used as fallback", () => {
    const result = resolveTerminalColors({
      targetHost: "unknown-host",
      isFromConfigFile: true,
      defaultColorsInput: defaultColors,
      hostColorsMap: {},
      resolvedHostName: "203.0.113.10",
      resolvedUser: "ubuntu",
    });

    assert.deepStrictEqual(result, defaultColors);
  });
});
