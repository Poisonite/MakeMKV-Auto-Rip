#!/usr/bin/env node

import { existsSync } from "fs";

console.log("MakeMKV Auto Rip installed successfully!");

if (
  process.platform === "win32" &&
  !existsSync("./build/Release/optical_drive_native.node")
) {
  console.warn(
    "WARNING: Native Windows addon missing - optical drive operations may not work"
  );
  console.warn(
    "    - You can try to build it manually by running `npm run build:windows-addons`"
  );
}
