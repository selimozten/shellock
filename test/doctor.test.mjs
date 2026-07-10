import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatDoctorReport, runDoctor } from "../dist/doctor/doctor.js";

test("doctor reports harness, runtime assets, and tool profile status without workspace ceremony", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-doctor-"));
  try {
    const report = await runDoctor({ workspaceRoot: root });
    const text = formatDoctorReport(report);

    assert.match(text, /Shellock doctor/);
    assert.doesNotMatch(text, /case file|MISSION\.md|mission workspace/i);
    for (const profile of ["base", "net-basic", "net-advanced", "lab", "vm-danger"]) {
      assert.match(text, new RegExp(`asset:incus ${profile} profile`));
    }
    assert.match(text, /tools:core/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
