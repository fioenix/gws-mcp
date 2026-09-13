import assert from "node:assert/strict";
import { IdentityGate } from "../dist/identitygate.js";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// 1. shared work runs in parallel — the common path must not be serialised
{
  const gate = new IdentityGate();
  let peak = 0, live = 0;
  await Promise.all(
    Array.from({ length: 5 }, () =>
      gate.shared(async () => {
        live++; peak = Math.max(peak, live);
        await tick();
        live--;
      }),
    ),
  );
  assert.equal(peak, 5, "shared sections must overlap");
}

// 2. the bug this exists for: a switch batched alongside calls must not interleave.
//    Every call has to observe one identity for its whole body.
{
  const gate = new IdentityGate();
  const log = [];
  let identity = "work";

  const call = (tag) =>
    gate.shared(async () => {
      const before = identity;
      await tick(10);
      assert.equal(identity, before, `${tag} saw identity change mid-call`);
      log.push(`call:${before}`);
    });

  const batch = [
    call("a"),
    call("b"),
    gate.exclusive(async () => {
      assert.equal(log.length, 2, "switch ran before in-flight calls drained");
      await tick(5);
      identity = "personal";
      log.push("switch");
    }),
    call("c"),
  ];
  await Promise.all(batch);

  assert.deepEqual(log, ["call:work", "call:work", "switch", "call:personal"]);
}

// 3. a steady stream of calls must not starve a queued switch
{
  const gate = new IdentityGate();
  let switched = false;
  const writer = gate.exclusive(async () => { switched = true; });
  for (let i = 0; i < 20; i++) {
    gate.shared(async () => { await tick(1); });
  }
  await writer;
  assert.equal(switched, true);
}

// 4. a throwing section still releases the gate
{
  const gate = new IdentityGate();
  await assert.rejects(gate.shared(async () => { throw new Error("boom"); }), /boom/);
  await assert.rejects(gate.exclusive(async () => { throw new Error("bang"); }), /bang/);
  assert.equal(await gate.shared(async () => "ok"), "ok", "gate stuck after a throw");
}

console.log("unit-identitygate: ok");
