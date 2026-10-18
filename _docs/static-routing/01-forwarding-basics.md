---
layout: guide
title: "1. How a Router Chooses a Path"
slug: "static-routing-forwarding-basics"
description: "The routing table, connected routes, and longest-prefix match: the rules every static route has to play by."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Beginner"
read_time: "6 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Longest Prefix Match"]
---

# 1. How a Router Chooses a Path

Before you write a single static route, you need a clear picture of what the router does with it. Most static routing bugs aren't typos. They come from a wrong assumption about which route wins. This chapter covers the decision rules; every later chapter builds on them.

## The Lab We'll Use All Course

One small topology runs through every chapter, so you can keep a single lab running and build on it.

![Course lab topology: BR1 connects the branch LAN 10.20.1.0/24 to HQ1 over 192.0.2.0/30; HQ1 connects the HQ LAN 10.10.0.0/16, ISP-A on Gi0/2 (primary) and ISP-B on Gi0/3 (backup); Linux server SRV1 sits on the branch LAN and on an out-of-band management network 192.168.50.0/24]({{ '/assets/diagrams/static-routing-lab.drawio.png' | relative_url }})

- **BR1** is a branch router (Cisco IOS) with one LAN and one WAN link to HQ.
- **HQ1** (Cisco IOS) owns the HQ LAN, the link to the branch, a primary internet uplink (ISP-A), and a cheaper backup (ISP-B).
- **SRV1** is a Linux server on the branch LAN (`eth0`, `10.20.1.10`). It also has a second NIC (`eth1`, `192.168.50.10`) on an out-of-band management network whose gateway is `192.168.50.1`. We'll use it whenever a host needs its own static routes.

Router examples use Cisco IOS; host examples use Linux.

All addresses come from private or documentation ranges, so nothing here collides with a real network.

## The Routing Table Is a List of Promises

A routing table (the RIB, Routing Information Base) is a list of entries, each saying: "to reach this prefix, send the packet here." Every entry has:

- **A prefix and length:** `10.10.0.0/16`.
- **A next-hop and/or exit interface:** where to send matching packets.
- **A source:** connected, static, OSPF, BGP, and so on.
- **Administrative distance and metric:** used to break ties (more in [chapter 4]({{ '/docs/static-routing-floating-routes/' | relative_url }})).

The router copies the best entries into the FIB (Forwarding Information Base, called CEF on Cisco), which is what the hardware actually uses to forward packets. When the RIB says one thing and traffic does another, a stale or different FIB entry is a good suspect; [chapter 9]({{ '/docs/static-routing-troubleshooting/' | relative_url }}) shows how to check.

## Connected Routes Come for Free

The moment you give an interface an IP address and it comes up, the router installs a connected route. Here's BR1 before any static routing:

```text
BR1# show ip route
Codes: L - local, C - connected, S - static, ...

Gateway of last resort is not set

      10.0.0.0/8 is variably subnetted, 2 subnets, 2 masks
C        10.20.1.0/24 is directly connected, GigabitEthernet0/1
L        10.20.1.1/32 is directly connected, GigabitEthernet0/1
      192.0.2.0/24 is variably subnetted, 2 subnets, 2 masks
C        192.0.2.0/30 is directly connected, GigabitEthernet0/0
L        192.0.2.2/32 is directly connected, GigabitEthernet0/0
```

The `C` lines are the subnets BR1 sits on. The `L` lines are the router's own addresses as /32 host routes. BR1 can reach its LAN and HQ1's WAN address, but it has no idea that `10.10.0.0/16` exists. Every packet for HQ gets dropped. That gap is what static routes fill.

Hosts have a routing table too. On SRV1, connected routes show up as `proto kernel scope link` entries, next to the default route it got from DHCP or its network config:

```bash
$ ip route
default via 10.20.1.1 dev eth0 proto static
10.20.1.0/24 dev eth0 proto kernel scope link src 10.20.1.10
192.168.50.0/24 dev eth1 proto kernel scope link src 192.168.50.10
```

## Longest-Prefix Match: The Rule That Beats Everything

When a packet arrives, the router looks for every route whose prefix contains the destination address, then picks the **most specific** one: the longest prefix length. This is longest-prefix match, and it happens *before* administrative distance or metric are even considered.

Say a router (a made-up one, not from our lab) has these routes:

```text
0.0.0.0/0       via 203.0.113.1
10.0.0.0/8      via 192.0.2.1
10.10.0.0/16    via 192.0.2.1
10.10.5.0/24    via 192.0.2.5
```

| Destination | Matching routes | Winner |
|---|---|---|
| `10.10.5.20` | /0, /8, /16, /24 | `10.10.5.0/24` |
| `10.10.9.1` | /0, /8, /16 | `10.10.0.0/16` |
| `10.99.0.1` | /0, /8 | `10.0.0.0/8` |
| `172.16.4.4` | /0 | `0.0.0.0/0` |

This matters for static routing in a very practical way: **a static /24 beats an OSPF /16, even though OSPF might be "better" by every other measure.** Administrative distance only compares routes for the *exact same* prefix and length. Engineers who forget this add a "backup" static route that's more specific than the primary and quietly steal all the traffic.

## Ask the Router, Don't Guess

You don't have to work out longest-prefix match by hand. Both routers and hosts will tell you which route they would use for a given destination:

```text
BR1# show ip route 10.10.5.20
```

```bash
$ ip route get 10.10.5.20
```

Make this a habit. Before and after every static route change, ask the router which entry it would use for a few real destinations. It's the fastest way to catch a route that's more or less specific than you meant.

## Gotchas and Edge Cases

- **Routing is per hop and one-way.** BR1 knowing how to reach HQ says nothing about HQ1 knowing how to reach the branch. Every static route needs a matching return path on the other side. Forgetting the return route is the most common "ping doesn't work" cause in this whole course.
- **A connected route only exists while the interface is up.** If Gi0/0 goes down, `192.0.2.0/30` disappears, and any static route that depends on it goes with it. You'll use that behavior on purpose in [chapter 4]({{ '/docs/static-routing-floating-routes/' | relative_url }}).
- **Host routes (/32) are the most specific possible.** A stray /32 static route will override everything else for that single address, which makes for very confusing troubleshooting.

## Key Takeaways

- The RIB lists candidate routes; the FIB is what actually forwards packets.
- Connected routes appear automatically for every up interface with an IP address.
- Longest-prefix match is applied first. Administrative distance and metric only break ties between identical prefixes.
- Always ask the router (`show ip route <addr>`, `ip route get <addr>`) instead of predicting the result in your head.
- Every route needs a return route on the far side.

---

**Previous:** [Course overview]({{ '/docs/static-routing/' | relative_url }}) · **Next:** [2. Your First Static Route]({{ '/docs/static-routing-first-static-route/' | relative_url }})
