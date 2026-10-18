---
layout: guide
title: "5. Making Static Routes Detect Failures"
slug: "static-routing-route-tracking"
description: "Tie static routes to real reachability with IP SLA object tracking and BFD, so failover happens when the path dies, not just when the cable does."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Intermediate"
read_time: "8 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "IP SLA", "BFD", "Failover"]
---

# 5. Making Static Routes Detect Failures

[Chapter 4]({{ '/docs/static-routing-floating-routes/' | relative_url }}) ended with a nasty gap: a floating backup only takes over when the primary static route leaves the routing table, and that only happens when the local interface goes down or the next-hop stops resolving. In real outages the link to the ISP's router usually stays up while something behind it breaks. The router keeps sending traffic into a dead path, and your backup sits unused.

The fix is to make the static route depend on a real health check.

## The Core Concept: Conditional Routes

Both techniques in this chapter work the same way. Something keeps checking the path, and the static route is only installed while the check passes.

| Technique | What it checks | Needs the other side to cooperate? | Typical detection time |
|---|---|---|---|
| IP SLA + object tracking (Cisco) | End-to-end reachability to a target you choose (ICMP, TCP, HTTP...) | No | Seconds to tens of seconds |
| BFD for static routes | Liveness of the directly connected next-hop | Yes, the neighbor must run BFD too | Sub-second possible |

IP SLA answers "can I reach the internet through ISP-A?" BFD answers "is ISP-A's router still forwarding packets to me?" They solve different problems and are often used together.

## Hands-On: IP SLA Tracking on HQ1

### Step 1: Define the Probe

```text
HQ1(config)# ip sla 10
HQ1(config-ip-sla)# icmp-echo 203.0.113.53 source-interface GigabitEthernet0/2
HQ1(config-ip-sla-echo)# frequency 10
HQ1(config-ip-sla-echo)# exit
HQ1(config)# ip sla schedule 10 life forever start-time now
```

The probe pings `203.0.113.53` every 10 seconds, sourced from the ISP-A interface. In production, pick a target **beyond** the ISP's edge router that is highly available and won't rate-limit you, such as a resolver your provider tells you is safe to probe. Here `203.0.113.53` is a documentation address standing in for it.

### Step 2: Track the Probe Result

```text
HQ1(config)# track 1 ip sla 10 reachability
HQ1(config-track)# delay up 30 down 10
```

The track object goes down after the probe has failed continuously for 10 seconds, and comes back up only after 30 seconds of success. The asymmetric delay is deliberate: fail over fast, fail back cautiously, so a flapping uplink doesn't bounce your traffic (the failback problem from chapter 4).

### Step 3: Attach the Track to the Primary Route

```text
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/2 203.0.113.1 track 1 name DEFAULT-ISP-A
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/3 198.51.100.1 250 name DEFAULT-ISP-B-BACKUP
```

While track 1 is up, the primary is installed. When it goes down, the primary is withdrawn and the floating backup from chapter 4 takes over.

### Step 4: Pin the Probe to ISP-A

This step is the one people skip, and it causes the classic failover flap:

```text
HQ1(config)# ip route 203.0.113.53 255.255.255.255 GigabitEthernet0/2 203.0.113.1 name PIN-SLA-PROBE
```

Without it, here's what happens. ISP-A fails, track 1 goes down, and the primary default is removed. Now the *probe itself* follows the backup default out through ISP-B, succeeds, and brings track 1 back up. The primary returns, the probe fails again, and the cycle repeats. The /32 host route makes sure the probe always tests ISP-A, whatever the default route is doing. (Longest-prefix match from [chapter 1]({{ '/docs/static-routing-forwarding-basics/' | relative_url }}) doing useful work.)

### Verify

```text
HQ1# show track 1
HQ1# show ip sla statistics 10
HQ1# show ip route 0.0.0.0
```

Then test it properly: break the path *beyond* Gi0/2. In a lab, shut the link behind the ISP-A router; in production, drop the probe on a device upstream. Shutting your own interface only tests what chapter 4 already handled. An outbound ACL on Gi0/2 won't work either, because IOS doesn't apply outbound ACLs to traffic the router generates itself.

## BFD for Static Routes

BFD (Bidirectional Forwarding Detection) is a lightweight hello protocol between two directly connected routers. On IOS-XE you enable it on the interface and bind it to the static next-hop:

```text
HQ1(config)# interface GigabitEthernet0/2
HQ1(config-if)# bfd interval 300 min_rx 300 multiplier 3
HQ1(config-if)# exit
HQ1(config)# ip route static bfd GigabitEthernet0/2 203.0.113.1
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/2 203.0.113.1
```

With a 300 ms interval and a multiplier of 3, a dead neighbor is detected in about 900 ms. On Junos:

```text
set routing-options static route 0.0.0.0/0 next-hop 203.0.113.1
set routing-options static route 0.0.0.0/0 bfd-liveness-detection minimum-interval 300
```

The catch is that **both ends must run BFD**. With an ISP, that means asking for it, and many business internet services won't offer it. BFD is more common on links you control: between your own routers, to a firewall cluster, or across a data-center fabric.

## What About Linux?

The Linux kernel has no built-in route tracking. Common approaches:

- A routing daemon such as FRRouting, which manages static routes and can tie them to BFD sessions. Check the `staticd` documentation for your FRR version.
- A small health-check service (systemd timer, keepalived script) that pings a target through a specific interface and runs `ip route replace` when the result changes. If you write your own, copy the IOS design: pin the probe with a /32 route and use asymmetric up/down delays.

## Gotchas and Edge Cases

- **One probe target is a single point of failure.** If that one host goes down or starts rate-limiting ICMP, you fail over while ISP-A is perfectly healthy. Track two targets and combine them, for example `track 3 list boolean or` with `object 1` and `object 2`, so the primary is only withdrawn when both fail.
- **Failover doesn't preserve sessions.** NAT translations and stateful firewall sessions belong to ISP-A's addresses. After failover, long-lived connections have to reconnect. That's normal; tell the help desk before the first real outage.
- **Don't combine tracking with `permanent`.** The IOS `permanent` keyword keeps a route installed even when its interface goes down, which defeats the whole point.
- **BFD timers that are too aggressive cause false failovers.** A busy control plane that misses a few hellos will drop the route. Start conservative (300 ms × 3) and tighten only after watching it under load.

## Key Takeaways

- Plain static routes can't see failures beyond the local link; tracking fixes that.
- IP SLA checks end-to-end reachability without help from the far end; BFD checks the next-hop quickly but needs both sides.
- Always pin the probe target to the primary path with a /32 route, or failover will flap.
- Use asymmetric delays: fail over fast, fail back slowly.
- Test failover by breaking the path upstream, not by shutting your own interface.

---

**Previous:** [4. Administrative Distance and Floating Static Routes]({{ '/docs/static-routing-floating-routes/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})** · **Next:** [6. Discard Routes, Summaries, and Loop Prevention]({{ '/docs/static-routing-discard-routes/' | relative_url }})
