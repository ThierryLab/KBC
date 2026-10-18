---
layout: guide
title: "8. Static Routes in a Dynamic Network"
slug: "static-routing-with-dynamic-routing"
description: "Redistribute static routes into OSPF and BGP without leaking junk, and know when it's time to replace static routing with a protocol."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Advanced"
read_time: "8 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "OSPF", "BGP", "Redistribution"]
---

# 8. Static Routes in a Dynamic Network

So far our lab has been all static: a branch, an HQ router, two ISPs. Real networks rarely stay that small. HQ adds a core layer running OSPF, and suddenly the core routers need to know about the branch and the internet, which only HQ1 knows through static routes. This chapter is about the boundary between static and dynamic routing, the place where most redistribution accidents happen.

## The Core Concept: Redistribution Copies Routes Between Sources

A routing protocol only advertises what it learned itself or what you explicitly inject into it. **Redistribution** takes routes from one source (here, static routes in HQ1's routing table) and advertises them into another (OSPF or BGP).

Two rules follow from what you already know:

- Only routes **installed in the routing table** get redistributed. A floating static waiting in the config (see [chapter 4]({{ '/docs/static-routing-floating-routes/' | relative_url }})) is not advertised until it activates.
- Withdrawals are redistributed too. When IP SLA tracking from [chapter 5]({{ '/docs/static-routing-route-tracking/' | relative_url }}) pulls a route, OSPF withdraws it from the whole domain. Your tracking now protects every router, not just HQ1.

## Hands-On: Static into OSPF on HQ1

HQ1 has accumulated quite a few static routes over this course: the branch route, two defaults, a /32 to pin the IP SLA probe, a Null0 discard for the public block. Only some of these belong in OSPF.

### Step 1: Select Exactly What to Advertise

```text
HQ1(config)# ip prefix-list BRANCH-NETS seq 10 permit 10.20.0.0/16 le 24
HQ1(config)# route-map STATIC-TO-OSPF permit 10
HQ1(config-route-map)# match ip address prefix-list BRANCH-NETS
HQ1(config-route-map)# set tag 65020
```

The prefix list matches the branch range and any subnet inside it up to /24. Everything else falls through to the implicit deny at the end of the route-map.

### Step 2: Redistribute Through the Filter

```text
HQ1(config)# router ospf 1
HQ1(config-router)# redistribute static subnets route-map STATIC-TO-OSPF
HQ1(config-router)# default-information originate
```

- `subnets` matters on classic IOS: without it, only classful networks are redistributed and your /24 silently disappears. Some newer IOS and IOS-XE releases add `subnets` automatically, but writing it explicitly does no harm.
- `default-information originate` advertises a default route into OSPF **only while HQ1 has one in its routing table**. Default routes aren't redistributed by `redistribute static`; they need this separate command.

### Step 3: Verify from a Core Router

```text
CORE1# show ip route ospf
O E2     10.20.1.0/24 [110/20] via 10.10.0.1, ...
O*E2  0.0.0.0/0 [110/1] via 10.10.0.1, ...
```

Both routes arrive as OSPF external type 2 (`E2`), learned from HQ1. Nothing else leaked.

### Why the Filter Matters

Without the route-map, `redistribute static subnets` advertises **every** static route on HQ1:

- The `/32` that pins the IP SLA probe now tells the whole core to send traffic for that address to HQ1, out ISP-A only, even when ISP-A is down.
- The Null0 discard routes now attract traffic from the core just to drop it at HQ1.
- Any temporary route an engineer added during an incident becomes network-wide policy.

Redistribution without a filter means you've lost track of what you're advertising.

### What the Tag Is For

`set tag 65020` labels these routes with a number of your choosing. If you ever redistribute OSPF into something else, or run mutual redistribution between two protocols, you can match on the tag and refuse to re-import routes that started life as statics on HQ1. Tags are the standard way to prevent redistribution loops, and adding them from day one costs nothing.

## Static Routes Anchor BGP Announcements

Here's an example outside our lab. Picture an edge router in AS 64500 that owns `198.51.100.0/24` and announces it to its ISPs. (Both are documentation values; this has nothing to do with ISP-B's link in our lab, which happens to use the same documentation range.) The BGP `network` command only advertises a prefix if an **exact match** exists in the routing table. The internal subnets are /26s and /27s, and they come and go with interface states, so tying the announcement to any of them would make the /24 flap.

The fix is the discard-route pattern from [chapter 6]({{ '/docs/static-routing-discard-routes/' | relative_url }}):

```text
EDGE(config)# ip route 198.51.100.0 255.255.255.0 Null0 name BGP-ANCHOR
EDGE(config)# router bgp 64500
EDGE(config-router)# address-family ipv4 unicast
EDGE(config-router-af)# network 198.51.100.0 mask 255.255.255.0
```

The Null0 route never goes down, so the announcement is rock-solid, and longest-prefix match sends real traffic to the specific internal subnets. Anything to unused addresses is dropped at the edge instead of looping with the ISP.

## When to Stop Using Static Routes

Static routing is a tool, not a phase you grow out of. But it stops paying off once the network has choices to make.

| Keep static | Move to a routing protocol |
|---|---|
| Stub sites with one exit | Two or more paths between non-stub sites |
| Default route toward a single-homed ISP | Multihoming with your own address space (BGP) |
| Discard and anchor routes | Subnets added or moved often |
| Management and out-of-band networks | More than a handful of routers needing the same routes |
| Cloud route tables (VPC/VNet routes are mostly static entries) | Failover that must be fast and correct without per-route tracking |

A common sign that it's time: you're writing IP SLA probes for internal paths. Probing your own core to decide where to send internal traffic is exactly what OSPF or IS-IS does natively. See [Why Routing Protocols Matter]({{ '/docs/importance-of-routing-protocols/' | relative_url }}) and [IS-IS vs OSPF]({{ '/docs/isis-vs-ospf/' | relative_url }}) for the next step.

## Gotchas and Edge Cases

- **`default-information originate always` can blackhole the whole network.** `always` advertises a default even when HQ1 has no internet at all. With two internet routers, the one that lost its uplinks keeps attracting traffic. Leave `always` off and let tracking control the default.
- **A static route on the redistributing router beats the OSPF version of the same prefix.** AD 1 vs 110 (chapter 4). That's usually what you want on HQ1, but it means HQ1 ignores OSPF for that prefix even if OSPF knows a better path.
- **Mutual redistribution without tags loops.** Routes leak from A into B, back into A with a different AD, and the network oscillates. Tag on the way in, deny the tag on the way back.
- **Redistributed metrics aren't real metrics.** OSPF external type 2 routes carry a fixed cost (20 by default for redistributed routes on IOS), not a measure of the actual path. Two routers redistributing the same prefix look equal unless you set metrics deliberately.

## Key Takeaways

- Redistribution only advertises routes that are installed, so tracking and floating routes still control what gets advertised.
- Always filter redistribution with a route-map and tag what you inject.
- Default routes go into OSPF with `default-information originate`, ideally without `always`.
- A Null0 static route is the standard anchor for a stable BGP `network` announcement.
- Once your network has real path choices, let a routing protocol make them.

---

**Previous:** [7. IPv6 Static Routes]({{ '/docs/static-routing-ipv6/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})** · **Next:** [9. Troubleshooting Static Routes]({{ '/docs/static-routing-troubleshooting/' | relative_url }})
