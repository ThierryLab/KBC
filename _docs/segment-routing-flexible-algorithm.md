---
layout: guide
title: "Segment Routing Flexible Algorithm: Custom Shortest Paths"
description: "How Flex-Algo lets the IGP compute extra, purpose-built topologies (low-delay, avoid-these-links, and so on) and give each one its own Prefix-SID."
classification: "Network Engineering"
category: "Networking"
subcategory: "Segment Routing"
difficulty: "Advanced"
read_time: "11 min"
last_updated: "October 2026"
tags: ["Networking", "Segment Routing", "Flex-Algo", "IS-IS", "MPLS", "Traffic Engineering"]
---

# Segment Routing Flexible Algorithm: Custom Shortest Paths Without SR-TE Policies

Classic IGP routing gives you exactly one answer to "what's the best path?": the lowest sum of link costs. That's fine until a customer asks for a low-latency path for voice, or you need to keep some traffic off a set of leased links, or you want two disjoint planes through the same core. Traditionally that meant RSVP-TE tunnels or a pile of SR-TE policies, each one something you configure, monitor, and debug individually.

**Segment Routing Flexible Algorithm (Flex-Algo)** takes a different route. Instead of building tunnels, you tell the IGP itself to run *additional* shortest-path computations, each with its own metric and its own constraints. Each computation gets its own Prefix-SID, so steering traffic onto the "low-delay plane" is as simple as using a different label.

By the end of this guide you'll understand how a Flex-Algo is defined, how routers agree on that definition, how the path is calculated, what ends up in the forwarding table, and what a working IOS XR config looks like.

## Prerequisites

- Comfortable with MPLS label forwarding. If not, read [MPLS Explained]({{ '/docs/mpls-explained/' | relative_url }}) first.
- Familiar with IS-IS (the examples use it). [IS-IS vs OSPF]({{ '/docs/isis-vs-ospf/' | relative_url }}) is a good refresher.
- Basic Segment Routing MPLS knowledge: SRGB, Prefix-SIDs, and how an index maps to a label.

## The Core Idea: An Algorithm Is Just "How the Path Is Computed"

In Segment Routing, every Prefix-SID is tied to an **algorithm**, which is simply the rule set used to compute the path to that prefix. Two are defined by standards:

| Algorithm | Meaning |
|---|---|
| 0 | Standard SPF on the IGP metric. This is what your normal Prefix-SIDs use. |
| 1 | Strict SPF. Same as 0, but transit nodes must not override the path with local policy. |

The algorithm is a one-octet field, and **values 128 to 255 are reserved for user-defined algorithms**. Nobody standardizes what "algorithm 128" means. You do. That's why it's called *Flexible* Algorithm.

A Flex-Algo is a combination of:

- **A metric type**: IGP metric, minimum link delay, or TE metric.
- **Constraints**: mostly link affinities (colors) to include or exclude.

So "Algo 128 = minimize delay" and "Algo 129 = IGP metric, but never touch links colored `red`" are both valid Flex-Algos. Combining them ("lowest delay, avoiding `red`") is valid too.

Think of it like a navigation app. Algorithm 0 is "shortest distance". Flex-Algo lets you add "fastest route" and "avoid toll roads" as extra options, and every router in the network runs the same options and gets the same answer.

```text
          metric 10, delay 20 ms        metric 10, delay 20 ms
      +------------------------> P1 ------------------------+
      |                                                     v
     PE1                                                   PE2
      |                                                     ^
      +------------------------> P2 ------------------------+
          metric 30, delay 2 ms         metric 30, delay 2 ms
```

In this topology, Algo 0 sends PE1 → PE2 traffic via P1 (total metric 20). A Flex-Algo with `metric-type delay` sends it via P2 (total delay 4 ms). Same routers, same IGP, two different shortest paths, and each one gets its own label.

## Flexible Algorithm Definition (FAD)

Here's the catch with user-defined meaning: if PE1 thinks Algo 128 means "lowest delay" and P1 thinks it means "lowest IGP metric", you get inconsistent forwarding and potentially loops. **Every router in the area must share the same definition.**

Flex-Algo solves this by having one or more routers **advertise the definition** in the IGP. This is the Flexible Algorithm Definition (FAD), and it carries:

- The metric type
- The constraints (affinities, and optionally SRLGs to exclude)
- A **priority**
- A calculation type (SPF today) and flags

Because several routers can advertise a FAD for the same algorithm, the priority is how they agree on a single winner. The highest priority wins. On a tie, the IS-IS router with the highest System ID wins (RFC 9350). Every router picks the same winning definition, so every router computes the same thing.

On IOS XR, the `advertise-definition` command under the `flex-algo` block is what makes a router originate the FAD.

> **Design rule:** at least one router in the area must advertise the definition. Make it **two**, typically your route reflectors or a pair of core routers, so losing one box doesn't make the algorithm disappear.

Routers that don't advertise the definition can still participate. They just need the algorithm enabled locally and will use whatever definition wins in the IGP.

## Flex-Algo Prefix-SIDs

A Flex-Algo topology is useless until something points into it. That's the Prefix-SID's job.

You advertise an **extra Prefix-SID per algorithm** on the prefixes you care about (normally loopbacks). Each one maps to a different label:

| Prefix | Algorithm | Index | Label (SRGB 16000 base) |
|---|---|---|---|
| 10.0.0.9/32 | 0 | 9 | 16009 |
| 10.0.0.9/32 | 128 | 309 | 16309 |

Every router participating in Algo 128 installs an MPLS path for label 16309 computed with the Algo 128 rules. Send a packet with 16009 and it follows the IGP-metric path. Send it with 16309 and it follows the low-delay path.

The important part: **only prefixes with a Flex-Algo-specific Prefix-SID get Flex-Algo forwarding.** If you forget to configure the algorithm 128 SID on a PE loopback, there is no Algo 128 path to that PE, full stop.

A common convention is to use a fixed offset per algorithm (for example, Algo 0 = index *N*, Algo 128 = index 300 + *N*, Algo 129 = index 400 + *N*). It makes labels readable at a glance during troubleshooting.

## How the Flex-Algo Path Is Calculated

Before a router computes anything for an algorithm, two conditions must hold:

1. The router is **configured to support** that Flex-Algo.
2. The router has a **valid definition** (a winning FAD) for it, and supports everything that definition asks for.

Miss either one and the router stops participating in that algorithm: it computes nothing and removes any forwarding state for it.

Then the router takes the full IGP topology and **prunes it** before running SPF. The pruning rules are where the "constraints" actually happen:

### 1. Prune non-participating nodes

Any node that doesn't advertise support for the Flex-Algo is removed from the topology. This is what makes Flex-Algo safe: traffic in the Algo 128 plane can never be sent through a router that doesn't know what Algo 128 is.

### 2. Apply affinity rules

Links can be tagged with affinities (colors). The FAD can contain up to three kinds of affinity rules, applied per link:

| Rule | Link is **pruned** when… | Typical use |
|---|---|---|
| **Exclude-any** | The link has *any* of the listed colors | "Never use satellite or leased links" |
| **Include-any** | The link has *none* of the listed colors | "Only use links that are `gold` or `silver`" |
| **Include-all** | The link is missing *at least one* of the listed colors | "Only use links that are both `encrypted` and `low-latency`" |

The FAD can also carry an **exclude-SRLG** rule, which prunes any link belonging to one of the listed Shared Risk Link Groups. It's handy for building two Flex-Algos that never share a fiber duct.

### 3. Check the metric

The router uses the metric type from the FAD. Every link has an IGP metric, but delay and TE metrics are optional. **If the FAD uses delay or TE metric and a link doesn't advertise it, the link is pruned** (it is not treated as metric 0). This one bites people regularly: you define a delay-based Flex-Algo, but delay measurement isn't enabled on half your links, so those links silently vanish from the Algo topology.

Once pruning is done, a regular SPF runs on what's left, using the FAD's metric.

```text
Full IGP topology
  -> drop nodes that don't advertise this Flex-Algo
  -> drop links that fail the affinity / SRLG rules
  -> drop links that don't advertise the FAD metric
  -> run SPF on what's left, using the FAD metric
```

## What Gets Installed in Forwarding

This is the part that surprises people coming from regular IGP routing. On IOS XR:

- **Only MPLS-to-MPLS entries** are installed for a Flex-Algo path.
- **No IP-to-IP or IP-to-MPLS entries.** A plain IP packet arriving at a PE will never be routed on the Flex-Algo topology on its own.
- The path is installed using the **Prefix-SID advertised for that algorithm**. If that SID isn't known, nothing is installed for that prefix in that algorithm.

In practice this means Flex-Algo builds the *road*, but something else has to put traffic *on* it. Usually that's an SR-TE policy or on-demand next-hop (ODN) that resolves to the Flex-Algo SID, or BGP service routes colored to request a given algorithm.

> **TODO:** verify the exact steering options (ODN `sid-algorithm`, automated steering, per-flow) supported on your platform and software release.

The upside of this design: your global routing table and Algo 0 forwarding are completely untouched. You can roll out Flex-Algo without risking existing traffic.

## Flexible Algorithm Prefix Metric

Like any SPF, Flex-Algo computation only sees the local area. For a prefix learned from another area or level (or redistributed), a router only knows the regular prefix metric advertised by the border routers. That metric reflects the Algo 0 path, so the router may pick a border router that's a poor exit for the Flex-Algo, or one that can't even reach the prefix in that Flex-Algo.

The **Flexible Algorithm Prefix Metric (FAPM)** fixes this by adding an Algo-specific prefix metric to the IS-IS prefix advertisement. It's only used when the winning FAD has the **M-flag** set. Then border routers must advertise the FAPM, and a prefix without it is treated as unreachable in that algorithm. RFC 9350 recommends against running Flex-Algo across areas without the M-flag. If you run multi-level IS-IS and want Flex-Algo to be end-to-end, this is the feature to look at.

> **TODO:** verify FAPM configuration syntax and support on your IOS XR release.

## Configuration Example (IOS XR, IS-IS)

Here's a minimal low-delay Flex-Algo on IS-IS instance `RD2`:

```text
router isis RD2
 flex-algo 128
  metric-type delay
  advertise-definition
 !
 interface Loopback0
  address-family ipv4 unicast
   prefix-sid algorithm 128 index 309
```

What each piece does:

- `flex-algo 128`: enables participation in algorithm 128 on this router.
- `metric-type delay`: Algo 128 computes paths on minimum link delay instead of IGP metric.
- `advertise-definition`: this router originates the FAD. Configure it on at least two routers.
- `prefix-sid algorithm 128 index 309`: gives Loopback0 a second Prefix-SID that is only valid in the Algo 128 topology. With the default SRGB (16000), that's label 16309.

Every router that should be part of the Algo 128 plane needs `flex-algo 128`. Only your chosen definition owners need `advertise-definition`. Every PE you want reachable via Algo 128 needs its own `prefix-sid algorithm 128` on its loopback.

### Adding an affinity constraint

To also exclude certain links, define an affinity name, reference it in the Flex-Algo, and color the links:

```text
router isis RD2
 affinity-map SATELLITE bit-position 1
 !
 flex-algo 128
  metric-type delay
  affinity exclude-any SATELLITE
  advertise-definition
 !
 interface GigabitEthernet0/0/0/2
  affinity flex-algo SATELLITE
```

> **TODO:** verify `affinity-map` and interface `affinity flex-algo` syntax for your IOS XR release.

### Don't forget the delay metric

`metric-type delay` only works if links actually advertise delay. On IOS XR this comes from Performance Measurement, enabled per interface:

```text
performance-measurement
 interface GigabitEthernet0/0/0/0
  delay-measurement
   advertise-delay 100
```

> **TODO:** verify Performance Measurement syntax and whether static delay values are an option on your platform.

## Common Gotchas

- **No definition, no paths.** If nobody advertises the FAD (or both definition owners are down), the algorithm has no valid definition and nothing is computed.
- **Missing metric = missing link.** With delay or TE metrics, every link that doesn't advertise the metric gets pruned. Partial rollout of delay measurement leads to partitioned Flex-Algo topologies.
- **Missing Prefix-SID = unreachable.** Forgot the `algorithm 128` SID on a PE loopback? That PE doesn't exist in Algo 128.
- **Non-participating nodes are holes.** If a single P router in the middle isn't configured for the algorithm, it's pruned. That can push traffic onto a long detour or leave no path at all.
- **No IP forwarding.** Flex-Algo doesn't change where plain IP traffic goes. If you expected traffic to "just move", you still need a steering mechanism.
- **Conflicting definitions.** Two routers advertising different FADs for the same algorithm won't break the network (priority picks a winner), but the loser's intent is silently ignored. Keep definitions identical on all owners.

## When Not to Use Flex-Algo

- You need **per-flow explicit paths** or bandwidth reservations for specific demands. Flex-Algo gives you a whole plane, not a hand-crafted path. Use SR-TE policies or a PCE.
- You only have **one or two** special flows. A couple of explicit SR-TE policies may be simpler than another IGP topology.
- Parts of your network run software that **doesn't support Flex-Algo**. Those nodes get pruned, which can make the plane unusable.

## Next Steps

- Read [RFC 9350, *IGP Flexible Algorithm*](https://www.rfc-editor.org/rfc/rfc9350.html), for the full definition of FAD, pruning rules, and FAPM.
- Look at RFC 8570 (IS-IS TE Metric Extensions, which obsoletes RFC 7810) for how delay is advertised.
- Pair Flex-Algo with TI-LFA: backup paths are computed per algorithm, so protection stays inside the same plane.
- Brush up on the fundamentals with [MPLS Explained]({{ '/docs/mpls-explained/' | relative_url }}) and [IS-IS vs OSPF]({{ '/docs/isis-vs-ospf/' | relative_url }}).
