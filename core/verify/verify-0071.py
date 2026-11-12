#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Bogdan Shapovalov and the Fury authors

"""Does patch 0071 report the synthesized candidates it promises, and only those?

Patch 0070 leaves the ICE agent with nothing to gather under
`disable_non_proxied_udp`. This patch adds two modes that synthesize a host and
an srflx candidate in the Blink binding, and extends the peer connection's
getStats() report with the same two entries. The claims are therefore:

  1. `off` still reports nothing (the 0070 state).
  2. `base_on_ip` reports the configured local address as host and the
     configured public address as srflx.
  3. `fixed` reports exactly the two addresses it was given.
  4. onicecandidate and getStats() agree; no address of this machine appears.
  5. The control: an unconfigured build still leaks, so the test is measuring
     the patch and not a browser that never had WebRTC.

Usage: core/verify/verify-0071.py <core binary>
See core/verify/README.md.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import browser  # noqa: E402

CORE = sys.argv[1]
results = []


def check(ok, text):
    results.append((ok, text))
    print(f"  {'OK  ' if ok else 'FAIL'} {text}", flush=True)


GATHER = r"""
new Promise(r => {
  const out = {candidates: [], types: {}, stats: []};
  let pc;
  try {
    pc = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
  } catch (e) { return r({error: String(e)}); }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    pc.getStats().then(report => {
      report.forEach(stat => {
        if (stat.type === 'local-candidate') {
          out.stats.push({
            id: stat.id,
            type: stat.candidateType,
            address: stat.address,
            port: stat.port,
          });
        }
      });
      out.state = pc.iceGatheringState;
      r(out);
    }).catch(e => { out.state = pc.iceGatheringState; out.statsError = String(e); r(out); });
  };
  pc.onicecandidate = e => {
    if (!e.candidate) { finish(); return; }
    out.candidates.push(e.candidate.candidate);
    const m = / typ (\w+)/.exec(e.candidate.candidate);
    if (m) out.types[m[1]] = (out.types[m[1]] || 0) + 1;
  };
  pc.createDataChannel('probe');
  pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => r({error: String(e)}));
  setTimeout(() => { out.timedOut = true; finish(); }, 14000);
})
"""

ADDR = re.compile(r"\b((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,})\b", re.I)


def gather(config, label):
    d = tempfile.mkdtemp(prefix="fury-0071-")
    args = [CORE, f"--user-data-dir={d}", "--remote-debugging-port=0",
            "--no-first-run", "--no-default-browser-check", "--use-mock-keychain",
            "--window-position=-4000,-4000", "--window-size=600,400"]
    fd = None
    if config is not None:
        cfg = os.path.join(d, "config.json")
        with open(cfg, "w") as f:
            json.dump(config, f)
        fd = os.open(cfg, os.O_RDONLY)
        os.set_inheritable(fd, True)
        args.append("--fury-fp-fd=3")
    pre = (lambda: os.dup2(fd, 3)) if fd is not None else None
    p = subprocess.Popen(args, preexec_fn=pre, close_fds=False,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if fd is not None:
        os.close(fd)
    pf = os.path.join(d, "DevToolsActivePort")
    port = None
    for _ in range(300):
        if os.path.exists(pf):
            try:
                port = int(open(pf).readline().strip())
            except ValueError:
                port = None
            if port:
                break
        if p.poll() is not None:
            raise RuntimeError(f"core exited {p.returncode}")
        time.sleep(0.2)
    time.sleep(1)
    ws = browser(port)
    t = ws.call("Target.createTarget", {"url": "https://example.com"})["targetId"]
    s = ws.call("Target.attachToTarget", {"targetId": t, "flatten": True})["sessionId"]
    ws.call("Runtime.enable", session=s)
    time.sleep(2.5)
    v = ws.call("Runtime.evaluate",
                {"expression": GATHER, "awaitPromise": True, "returnByValue": True,
                 "timeout": 30000}, session=s)["result"].get("value") or {}
    p.terminate()
    try:
        p.wait(timeout=12)
    except subprocess.TimeoutExpired:
        p.kill()
    shutil.rmtree(d, ignore_errors=True)

    addresses = set()
    for c in v.get("candidates") or []:
        for a in ADDR.findall(c):
            if a.startswith("127.") or a in ("0.0.0.0", "::1", "::"):
                continue
            addresses.add(a)
    stats = {s.get("address") for s in (v.get("stats") or []) if s.get("address")}
    print(f"  [{label}] types={json.dumps(v.get('types'))} "
          f"state={v.get('state')} candidate_addrs={sorted(addresses) or 'none'} "
          f"stat_addrs={sorted(stats) or 'none'}")
    return v, addresses, stats


OFF = {
    "schema_version": 1,
    "webrtc": {"ipHandlingPolicy": "disable_non_proxied_udp", "mode": "off"},
}
BASE = {
    "schema_version": 1,
    "webrtc": {
        "ipHandlingPolicy": "disable_non_proxied_udp",
        "mode": "base_on_ip",
        "localIp": "192.168.50.17",
        "publicIp": "203.0.113.7",
    },
}
FIXED = {
    "schema_version": 1,
    "webrtc": {
        "ipHandlingPolicy": "disable_non_proxied_udp",
        "mode": "fixed",
        "localIp": "10.0.0.42",
        "publicIp": "198.51.100.9",
    },
}

print("\n--- off: no candidate set ---")
v, addresses, stats = gather(OFF, "off")
check((v.get("types") or {}) == {} and v.get("state") == "complete",
      "off gathers nothing and completes, as 0070 did")
check(not addresses and not stats, "off exposes no address on either surface")

print("\n--- base_on_ip: local private, public from the config ---")
v, addresses, stats = gather(BASE, "base_on_ip")
check((v.get("types") or {}).get("host") == 1 and (v.get("types") or {}).get("srflx") == 1,
      "one host and one srflx candidate are reported")
check("192.168.50.17" in addresses and "203.0.113.7" in addresses,
      "the candidates carry the configured local and public addresses")
check(addresses == {"192.168.50.17", "203.0.113.7"},
      "no other address reaches the page")
check(stats == {"192.168.50.17", "203.0.113.7"},
      "getStats() reports the same two local candidates")
check(v.get("state") == "complete", "gathering completes after the synthesized set")

print("\n--- fixed: exactly the addresses typed in ---")
v, addresses, stats = gather(FIXED, "fixed")
check((v.get("types") or {}).get("host") == 1 and (v.get("types") or {}).get("srflx") == 1,
      "one host and one srflx candidate are reported")
check(addresses == {"10.0.0.42", "198.51.100.9"},
      "the candidate list is exactly the configured pair")
check(stats == {"10.0.0.42", "198.51.100.9"},
      "getStats() agrees with the candidate events")

print("\n--- control: no config still leaks ---")
_, leaked, _ = gather(None, "no config")
check(bool(leaked),
      "an unconfigured build still hands the page this machine's address, so the "
      "test measures the patch and not an inert browser")

bad = [t for ok, t in results if not ok]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
