---
layout: guide
title: "6. Discard Routes, Summaries, and Loop Prevention"
slug: "static-routing-discard-routes"
description: "Use Null0 and blackhole routes to drop traffic on purpose, break default-route loops, and anchor summary routes."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Intermediate"
read_time: "6 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Null0", "Summarization"]
---

# 6. Discard Routes, Summaries, and Loop Prevention

With [chapter 5]({{ '/docs/static-routing-route-tracking/' | relative_url }}) done, our forwarding works and fails over properly. Now for the opposite problem: traffic the router *shouldn't* forward. Back in [chapter 3]({{ '/docs/static-routing-default-routes/' | relative_url }}) we saw how a summary plus a default route can bounce packets between BR1 and HQ1 until their TTL expires. A route that deliberately drops traffic fixes that, and has a few other uses too.

## The Core Concept: A Route to Nowhere

A **discard route** matches a prefix like any other route, but instead of a next-hop it points at a sink: `Null0` on Cisco routers, `blackhole` (and friends) on Linux hosts. Matching packets are dropped right there.

Why would you want that? Because of longest-prefix match. A discard route for a broad prefix catches only the traffic that **no more specific route** claims. Real subnets keep working, and everything else inside the range is dropped locally instead of falling through to the default route.

Think of it as the "return to sender" bin for addresses that are yours on paper but don't exist yet.

## Hands-On: Fixing the Branch Loop

The setup from chapter 3: HQ1 sends all of `10.20.0.0/16` to BR1, but only `10.20.1.0/24` exists at the branch. A packet for `10.20.9.9` arrives at BR1, matches nothing but the default, goes back to HQ1, and loops.

Give BR1 a discard route for the whole branch range:

```text
BR1(config)# ip route 10.20.0.0 255.255.0.0 Null0 name BRANCH-RANGE-DISCARD
```

```text
BR1# show ip route 10.20.9.9
Routing entry for 10.20.0.0/16
  Known via "static", distance 1, metric 0 (connected)
  Routing Descriptor Blocks:
  * directly connected, via Null0
```

Now:

| Destination | Best match on BR1 | Result |
|---|---|---|
| `10.20.1.50` | `10.20.1.0/24` (connected) | Delivered to the LAN |
| `10.20.9.9` | `10.20.0.0/16` (Null0) | Dropped at BR1 |
| `10.10.0.1` | `0.0.0.0/0` | Sent to HQ1 |

The loop is gone, and when the branch adds `10.20.2.0/24` later, the new connected route automatically wins over the discard.

By default IOS sends an ICMP unreachable for every packet dropped by Null0. Under a scan or a flood, that wastes CPU and confirms to the scanner that you exist. Turn it off:

```text
BR1(config)# interface Null0
BR1(config-if)# no ip unreachables
```

## The Same Fix for Your Public Block

The same loop happens at the internet edge. Say ISP-A routes a public block, `203.0.113.16/28`, to HQ1, and you've only assigned a few of those addresses. A packet for an unused address arrives at HQ1, matches only the default route, and goes straight back to ISP-A, which sends it back to you. Add a discard route for the whole block on HQ1:

```text
HQ1(config)# ip route 203.0.113.16 255.255.255.240 Null0 name PUBLIC-BLOCK-DISCARD
```

Many edge designs also discard the RFC 1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) so traffic for internal subnets that don't exist never leaks out the default to the ISP. Your real internal subnets are more specific and keep working.

## Discard Routes Anchor Summaries

When you advertise a summary (one route for many subnets) to another router, you're promising to deliver anything inside it. A discard route for the summary makes that promise safe: anything you can't actually deliver is dropped at the edge instead of looping.

Routing protocols do this for you in some cases. EIGRP installs a Null0 route when you configure a summary, and IOS OSPF installs a discard route for summaries created with `area range` or `summary-address`. With static routing you do it yourself, and in [chapter 8]({{ '/docs/static-routing-with-dynamic-routing/' | relative_url }}) you'll use exactly this pattern to originate a stable BGP aggregate.

## Discard Routes on a Linux Host

Hosts don't summarize anything, but a discard route is still a handy tool on a server: it's the fastest way to stop a box from talking to a destination, for example cutting SRV1 off from a misbehaving API during an incident. Linux has three types:

```bash
sudo ip route add blackhole 203.0.113.99/32
sudo ip route add unreachable 203.0.113.99/32
sudo ip route add prohibit 203.0.113.99/32
```

Pick one, not all three; they're alternatives for the same prefix. `blackhole` drops silently, so applications hang until their timeouts fire. `unreachable` and `prohibit` fail immediately with an error (host unreachable and administratively prohibited, respectively), which is usually what you want on a host: the application gives up fast instead of piling up stuck connections. Remove the route with `ip route del` once the incident is over, and use a firewall rule if the block needs to stay.

## Gotchas and Edge Cases

- **A discard route is a route like any other.** If it's more specific than a real route, it wins and blackholes real traffic. A Null0 `/24` for a subnet that actually lives behind a `/16` elsewhere is a self-inflicted outage.
- **Check what relies on the default before discarding big ranges.** If HQ1 reaches a cloud VPC at `10.200.0.0/16` through the default route (say, via a firewall doing IPsec), a Null0 `10.0.0.0/8` breaks it. Add the specific route first, then the discard.
- **Discard routes hide mistakes too.** A typo that leaves a subnet off a router now drops traffic silently instead of looping visibly. Make sure your monitoring catches unreachable services, not just interface states.
- **Remote-triggered blackholing (RTBH) uses the same building block.** Under DDoS, operators point a victim prefix at a next-hop that every router resolves to Null0, dropping the attack at the edge. It's an advanced technique, but it's the same discard route you just learned.

## Key Takeaways

- Discard routes (Null0 on routers, `blackhole`/`unreachable` on Linux hosts) drop matching traffic locally.
- Because of longest-prefix match, a broad discard route only catches traffic that no specific route claims.
- Use them to stop summary-plus-default loops and to anchor summaries you advertise.
- Turn off ICMP unreachables on Null0 on internet-facing routers; on hosts, prefer `unreachable` so applications fail fast.

---

**Previous:** [5. Making Static Routes Detect Failures]({{ '/docs/static-routing-route-tracking/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})** · **Next:** [7. IPv6 Static Routes]({{ '/docs/static-routing-ipv6/' | relative_url }})
