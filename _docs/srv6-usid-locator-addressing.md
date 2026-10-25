---
layout: guide
title: "SRv6 uSID Locator Addressing: Designing a Plan That Survives 57,000 Routers"
description: "A story-driven walkthrough of a Cisco SRv6 uSID (F3216) addressing scheme: how block, flex-algo, domain and node bits fit into a /48 locator, the math behind it, and a working IOS XR + IS-IS config."
classification: "Network Engineering"
category: "Networking"
subcategory: "Segment Routing"
difficulty: "Advanced"
read_time: "17 min"
last_updated: "October 2026"
tags: ["Networking", "Segment Routing", "SRv6", "uSID", "IPv6", "IS-IS", "Flex-Algo", "IOS XR"]
---

# SRv6 uSID Locator Addressing: Designing a Plan That Survives 57,000 Routers

Maya had been staring at the same spreadsheet for two days.

Her team was moving the backbone from SR-MPLS to SRv6 micro-SIDs. The routers were ready, the software was ready, and the lab had worked on the first try, which should have been a warning. Now she needed an addressing plan for the real network: five IS-IS domains today, maybe twelve after the next acquisition, a low-latency flex-algo for the voice team, a second one the mobile team was already asking about, and a few thousand routers that would all need a locator.

Her first draft numbered the nodes 1, 2, 3 in the order they were racked. It worked perfectly until she tried to summarize a domain and realized her "domain 3" routers were scattered across six different prefixes. The border routers would have to carry every single /48. So would everything behind them.

That's the trap with SRv6 addressing: **the address *is* the routing plan.** A locator isn't just a label you stick on a box. It decides what can be summarized, how big the IGP gets, and whether a flex-algo path even has a route to follow. Get the bit layout right on day one and the network scales almost for free. Get it wrong and you renumber thousands of routers later.

This guide walks through the scheme Maya ended up with: a Cisco-style F3216 uSID plan that encodes flex-algo, domain, and node ID directly into the locator. You'll see the math behind it, work through real address calculations, and finish with an IOS XR config that puts it into practice.

## Prerequisites

- Solid IPv6 addressing: prefix lengths, hex nibbles, and how `::` compression works.
- Familiarity with IS-IS. [IS-IS vs OSPF]({{ '/docs/isis-vs-ospf/' | relative_url }}) is a good refresher.
- Flex-Algo basics. If "algorithm 128" doesn't mean anything yet, read [Segment Routing Flexible Algorithm]({{ '/docs/segment-routing-flexible-algorithm/' | relative_url }}) first.

## uSID in 90 Seconds

Classic SRv6 uses a full 128-bit IPv6 address for every segment, so a five-segment path costs 80 bytes in the Segment Routing Header's segment list alone, before the SRH's own 8-byte header and the 40-byte outer IPv6 header. **Micro-SIDs (uSIDs)** pack several instructions into a single 128-bit address called a **uSID carrier**.

The format Cisco IOS XR uses is **F3216**: a **32-bit uSID block** followed by **16-bit uSIDs**. That leaves 128 − 32 = 96 bits, which is room for six uSIDs in one carrier:

```text
fcbb:bb00 : 0012 : 55dc : e004 : 0000 : 0000 : 0000
 uSID block  uSID1  uSID2  uSID3  End-of-Carrier ...
```

Each router that owns a uSID "consumes" it: it shifts the remaining uSIDs left by 16 bits, fills the tail with `0000`, and forwards on the new destination address. Routers that don't know anything about SRv6 just see a normal IPv6 destination and do a normal longest-prefix-match lookup. That's what makes uSID deployable through existing IPv6 cores.

Three facts about the 16-bit uSID space matter for addressing:

| uSID value | Meaning |
|---|---|
| `0x0000` | **End-of-Carrier (EoC).** Marks empty positions, so no node can ever use it. |
| `0x0001`–`0xDFFF` | **Global IDs.** Routable node uSIDs (uN), advertised as a /48 locator. |
| `0xE000`–`0xFFFF` | **Local IDs.** Each node allocates these for itself: adjacency SIDs (uA), VPN SIDs (uDT4/uDT6), and so on. Not routable on their own. |

So a single /32 uSID block gives you `0xDFFF` = 57,343 globally routable node IDs. Remember that number. It's going to keep coming back.

## The Rules of the Road on Cisco

Before laying out bits, Maya wrote down the constraints she couldn't negotiate:

- **One base block for the whole domain.** On Cisco routers, all SRv6 locators in the SRv6 domain must come from the same /24 base block. You can see it in `show segment-routing srv6 manager` as the *SID Base Block*.
- **Use ULA space.** Cisco recommends allocating uSID blocks from the IPv6 Unique Local Address range, using a /24 base from `fc00::/8`, for example `fcbb:bb00::/24`. Public GUA space is supported too, but ULA keeps your SIDs clearly separate from customer and internet routes.
- **One format: F3216.** A uSID domain uses a single carrier format. On NCS 5500/5700 you enable it with a hardware profile and a reload (more on that in the config section).
- **Locators per node are limited.** The NCS 5500 guide for IOS XR 24.x lists up to **8 uSID locator prefixes** per router and up to **64 uSID blocks** across the network. Your platform and release may differ, so check before you promise sixteen flex-algos on every box.

## The Scheme: Packing Meaning into a /48

Here's the layout. The uSID locators come from the block `fcbb:bb00::/28` and each locator is a /48 of the form:

```text
fcbb:bb0G:DNNN::/48
```

![Bit layout of the uSID locator: fcbb:bb is the 24-bit base, a fixed 0 nibble, G selects the flex-algo, D is the domain and NNN the node ID. Base plus 0 plus G form the /32 uSID block; D plus NNN form the 16-bit node uSID; together they make the /48 locator]({{ '/assets/diagrams/srv6-usid-locator-addressing-bit-layout.drawio.png' | relative_url }})

| Field | Bits | Values | What it means |
|---|---|---|---|
| `fcbb:bb` | 24 | fixed | The /24 base block. Identical across the entire SRv6 domain. |
| `0` | 4 | `0` | Reserved for now. Keeping it at zero means the plan only uses `fcbb:bb00::/28` and leaves the other fifteen /28s in the base free for the future. |
| `G` | 4 | `0x0`–`0xF` | Flex-algo selector. Each value gives a separate /32 uSID block. |
| `D` | 4 | `0x0`–`0xD` | Domain ID. `0xE` and `0xF` are off-limits (see below). |
| `NNN` | 12 | `0x000`–`0xFFF` | Node ID within the domain. |

The first 32 bits (`fcbb:bb0G`) are the **uSID block**, and the next 16 bits (`DNNN`) are the node's **uSID**. That's exactly the F3216 split, which is the whole point: the domain and node are encoded *inside* the uSID, so routers can summarize on nibble boundaries.

### Why D Stops at 0xD

If `D` were `E` or `F`, the node uSID would land in `0xE000`–`0xFFFF`. That's the local ID range every router uses for its own adjacency and service SIDs. A global node ID there would collide with local instructions, so the scheme simply never hands out `D = E` or `D = F`.

### Mapping G to Algorithms

`G` is a 4-bit field, but flex-algo numbers run from 128 to 255. So `G` is a lookup key you define once and publish in your design doc:

| G | Algorithm | uSID block | Example use |
|---|---|---|---|
| `0` | 0 (default SPF) | `fcbb:bb00::/32` | Best-effort traffic |
| `1` | 128 | `fcbb:bb01::/32` | Low-delay (delay metric) |
| `2` | 129 | `fcbb:bb02::/32` | Avoid a set of links via affinity |
| … | … | … | … |
| `F` | 142 | `fcbb:bb0f::/32` | Reserved |

The router doesn't know or care about this mapping. On IOS XR, the link between a locator and an algorithm is the `algorithm 128` line under the locator. The mapping table exists so that humans reading `fcbb:bb01:...` immediately know "this is the low-delay plane."

## Example 1: Fewer Domains, More Nodes per Domain

This is the plan Maya went with: a handful of large IS-IS domains, each with lots of routers.

**Per flex-algo:**

- Domains: `0x0`–`0xD` = **14 domains**
- Nodes per domain: `0x000`–`0xFFF` = **4,096 nodes**
- Total: 14 \* 4096 - 1 = 57,343 nodes

The `- 1` is the End-of-Carrier rule: domain `0`, node `000` would give uSID `0x0000`, which is reserved. So domain 0 gets 4,095 usable node IDs and every other domain gets 4,096.

**Across all algorithms:** 16 flex-algos × 57,343 = **917,488 locators**. In practice you'll never use all 16 blocks on every node (remember the per-node locator limit), but the address space is there.

### Worked Calculation 1: Encode a Locator

PE-B is node 1,500 in domain 5. It needs a locator for algo 0 and one for flex-algo 128.

1. Convert the node ID to hex: 1500 = `0x5DC`.
2. Build the 16-bit uSID: `D` = `5`, `NNN` = `5DC`, so uSID = `55DC`.
3. Algo 0 → `G` = `0`: **`fcbb:bb00:55dc::/48`**
4. Algo 128 → `G` = `1`: **`fcbb:bb01:55dc::/48`**

Same router, same uSID value, two different blocks. That symmetry is deliberate: when you're troubleshooting at 2 AM, `55dc` means PE-B no matter which plane you're looking at.

### Worked Calculation 2: Decode a Locator

You spot `fcbb:bb01:3a7f::/48` in a routing table. Read it nibble by nibble:

| Part | Value | Meaning |
|---|---|---|
| `fcbb:bb` | base | Our SRv6 domain |
| `0` | 0 | Reserved nibble, as expected |
| `1` | G = 1 | Flex-algo 128 (low-delay plane) |
| `3` | D = 3 | Domain 3 |
| `a7f` | NNN = 0xA7F | Node 10 × 256 + 7 × 16 + 15 = 2,687 |

No database lookup needed. The address tells you where the router lives.

### Worked Calculation 3: The Domain Summary

Every node in domain 5 on algo 0 has a locator `fcbb:bb00:5NNN::/48`. The first 36 bits are identical (32-bit block + the `D` nibble), so the whole domain collapses into one route:

```text
fcbb:bb00:5000::/36  covers  fcbb:bb00:5000::/48 … fcbb:bb00:5fff::/48
```

A /36 contains 2<sup>48−36</sup> = 2<sup>12</sup> = 4,096 /48s, which matches the 4,096 node IDs per domain exactly. With two algorithms in use, each domain border advertises just **two** prefixes into the rest of the network:

- `fcbb:bb00:5000::/36` (algo 0)
- `fcbb:bb01:5000::/36` (algo 128)

![Three IS-IS domains: Domain 1 with PE-A (uSID 1042) and P-1 (1007), Domain 0 core with P-C1 (0011) and P-C2 (0012), Domain 5 with P-5 (5101) and PE-B (55dc). Border router BR-1 advertises fcbb:bb00:1000::/36 and fcbb:bb01:1000::/36 into the core; BR-5 advertises fcbb:bb00:5000::/36 and fcbb:bb01:5000::/36]({{ '/assets/diagrams/srv6-usid-locator-addressing-multi-domain.drawio.png' | relative_url }})

Fourteen domains, two algorithms: 28 summary routes describe the reachability of up to 57,343 routers per plane. That's what Maya's first spreadsheet couldn't do.

### Worked Calculation 4: Build a Carrier and Walk It

PE-A (domain 1, uSID `1042`) wants to send a VPN packet to PE-B, but traffic engineering wants it to pass through core node P-C2 (uSID `0012`) first. PE-B advertised its VPN service SID via BGP as `fcbb:bb00:55dc:e004::`. The `e004` is a local uDT4 function from PE-B's local ID range.

PE-A builds a single carrier with the block once, then the uSIDs in order:

```text
fcbb:bb00:0012:55dc:e004:0000:0000:0000
          └P-C2┘└PE-B┘└VPN ┘└── End-of-Carrier ──┘
```

Written compressed: `fcbb:bb00:12:55dc:e004::`. Here's the trip:

1. **Inside domain 1:** routers do a plain IPv6 lookup. `fcbb:bb00:12:...` matches the core's summary (or a default toward BR-1). Nothing is rewritten.
2. **At P-C2:** the DA matches its uN locator `fcbb:bb00:12::/48`. P-C2 pops `0012`, shifts left, and the DA becomes `fcbb:bb00:55dc:e004::`.
3. **Across the core:** the new DA matches domain 5's summary `fcbb:bb00:5000::/36`, so the packet heads to BR-5.
4. **At BR-5:** inside domain 5 it has the specific `fcbb:bb00:55dc::/48`, so it forwards toward PE-B.
5. **At PE-B:** the DA matches its local uDT4 SID `fcbb:bb00:55dc:e004::`. PE-B decapsulates and looks up the inner IPv4 packet in the customer VRF.

One 40-byte IPv6 header carried a TE waypoint, a destination, and a VPN instruction. No Segment Routing Header was needed.

## Example 2: More Domains, Fewer Nodes per Domain

Not every network looks like Maya's. A provider with hundreds of small metro rings wants many small domains instead. Same block, different split of the 16-bit uSID:

```text
fcbb:bb0G:DDNN::/48
```

- `DD`: `0x00`–`0xDF` = **224 domains** (again stopping before `0xE0` to protect the local ID range)
- `NN`: `0x00`–`0xFF` = **256 nodes per domain**
- Total: 224 × 256 − 1 = **57,343** nodes per algo

Here's the interesting part: **the total is identical.** Of course it is. However you slice 16 bits, the routable space is `0x0001`–`0xDFFF`. The split doesn't create capacity. It decides **where you can summarize**.

| | Example 1 (`DNNN`) | Example 2 (`DDNN`) |
|---|---|---|
| Domains per algo | 14 | 224 |
| Nodes per domain | 4,096 (4,095 in domain 0) | 256 (255 in domain 0) |
| Total nodes per algo | 57,343 | 57,343 |
| Domain summary length | /36 | /40 |
| Domain 5 summary (algo 0) | `fcbb:bb00:5000::/36` | `fcbb:bb00:0500::/40` |
| Good fit | Few large IS-IS domains | Many small access/metro domains |

### Worked Calculation 5: Example 2 Encode

Node 200 in metro domain 0x2A (42), on algo 129 (`G = 2`):

1. Node: 200 = `0xC8`, so `NN` = `C8`.
2. Domain: `DD` = `2A`.
3. uSID = `2AC8`, so the locator is **`fcbb:bb02:2ac8::/48`**.
4. Domain summary on that plane: **`fcbb:bb02:2a00::/40`** (covers `2a00`–`2aff`, 256 /48s).

A quick sanity check before you commit to a split: count your largest domain today, double it, and make sure it fits in the node field. Renumbering a domain because it outgrew 256 nodes is exactly the kind of work this plan exists to avoid.

## Free Loopbacks: Addressing Loopback0 from the Locator

There's one more trick in the plan, and it's Maya's favorite.

Every router needs a Loopback0 IPv6 address for BGP sessions and the SRv6 encapsulation source. Normally that's another /128 per router in IS-IS: thousands of extra prefixes in every domain, plus a separate range you have to plan and summarize.

Instead, take the loopback from the algo-0 locator itself. Cisco allows fifteen special addresses for this: **`<locator>::X/128`, where X runs from `0x1` to `0xF`**. For PE-B:

```text
Locator (algo 0):   fcbb:bb00:55dc::/48
Loopback0:          fcbb:bb00:55dc::1/128
```

Because the loopback sits *inside* the locator that IS-IS already advertises, **Loopback0 doesn't need to be advertised in IS-IS at all.** Traffic to `fcbb:bb00:55dc::1` follows the `/48` inside the domain and the `/36` summary everywhere else. One prefix per node per algorithm, no exceptions.

## Putting It on a Router: IOS XR with IS-IS

Here's PE-B, node `55dc` in domain 5. The design: each domain is an IS-IS Level 1 area, the core is Level 2, and border routers like BR-5 are L1/L2. PE-B carries two locators, algo 0 and flex-algo 128 (low delay).

### Step 1: Enable uSID on the Platform (NCS 5500/5700)

```text
hw-module profile segment-routing srv6 mode micro-segment format f3216
```

This requires a router (or line card) reload. Plan it into the maintenance window. Other platforms may not need this step; check your platform's segment routing guide.

### Step 2: Locators, Encapsulation Source, and Loopback

```text
segment-routing
 srv6
  encapsulation
   source-address fcbb:bb00:55dc::1
  !
  locators
   locator ALGO0
    micro-segment behavior unode psp-usd
    prefix fcbb:bb00:55dc::/48
   !
   locator ALGO128
    micro-segment behavior unode psp-usd
    prefix fcbb:bb01:55dc::/48
    algorithm 128
   !
  !
 !
!
interface Loopback0
 ipv6 address fcbb:bb00:55dc::1/128
!
interface HundredGigE0/0/0/0
 ipv6 enable
!
```

`micro-segment behavior unode psp-usd` makes each locator a uSID locator whose node SID (uN) uses the PSP/USD flavors. `algorithm 128` ties the second locator to flex-algo 128, which is the `G = 1` block in our plan.

### Step 3: IS-IS, Flex-Algo, and Delay Measurement

```text
router isis DOMAIN5
 is-type level-1
 net 49.0005.0000.0000.55dc.00
 address-family ipv6 unicast
  metric-style wide
  segment-routing srv6
   locator ALGO0
   !
   locator ALGO128
   !
  !
 !
 flex-algo 128
  metric-type delay
  advertise-definition
 !
 interface HundredGigE0/0/0/0
  point-to-point
  address-family ipv6 unicast
  !
 !
!
performance-measurement
 interface HundredGigE0/0/0/0
  delay-measurement
 !
!
```

Notice what's **not** there: Loopback0 isn't under `router isis`. Its address lives inside `ALGO0`, so the locator advertisement covers it.

Flex-algo 128 uses the delay metric, so links need measured delay. That's why `performance-measurement` is enabled on the interface. Without it, the algorithm has nothing to compute on.

### Step 4: Summarize at the Domain Border (BR-5)

On BR-5, summarize domain 5's locators when they're advertised into the Level 2 core:

```text
router isis CORE
 address-family ipv6 unicast
  summary-prefix fcbb:bb00:5000::/36
  summary-prefix fcbb:bb01:5000::/36 algorithm 128 explicit
 !
!
```

The `algorithm 128 explicit` keywords make sure only flex-algo 128 locators contribute to the algo-128 summary, so a best-effort locator can't accidentally keep the low-delay summary alive.

### Step 5: Verify

```text
RP/0/RP0/CPU0:PE-B# show segment-routing srv6 locator

Name                  ID       Algo  Prefix                    Status   Flags
--------------------  -------  ----  ------------------------  -------  --------
ALGO0                 1        0     fcbb:bb00:55dc::/48       Up       U
ALGO128               2        128   fcbb:bb01:55dc::/48       Up       U
```

Then check the SIDs the router allocated, the flex-algo definition, and that a remote domain's summary is in the table:

```text
show segment-routing srv6 sid
show isis flex-algo 128
show route ipv6 fcbb:bb00:1000::/36
```

In `show segment-routing srv6 sid` you should see `fcbb:bb00:55dc::` as the uN SID and `fcbb:bb00:55dc:e0xx::` entries for uA and VPN SIDs. That's the local `0xE000`+ range doing its job, right where the plan expected it.

## Gotchas and When This Bites

- **Flex-algo traffic doesn't follow a default route.** A Level 1 router's default route (via the attached bit) is an algo-0 thing. If domain 5 needs to reach domain 1 on the low-delay plane, `fcbb:bb01:1000::/36` must actually be present in domain 5. Leak the remote per-algo summaries into each domain (or redistribute them between IS-IS instances). Otherwise algo-128 traffic has no path.
- **Summaries hide node failures.** When PE-B dies, domain 1 still sees `fcbb:bb00:5000::/36`, so BGP next-hop tracking on PE-A won't notice that `fcbb:bb00:55dc::1` is gone. Plan for faster failure detection: BGP PIC, BFD on critical sessions, or IS-IS Unreachable Prefix Announcements where your release supports them.
  > **TODO:** verify which IOS XR release adds IS-IS UPA support on your platform.
- **The locator limit per node is real.** Sixteen `G` values look great on paper, but the NCS 5500 24.x guide lists 8 uSID locators per node. Decide which planes each role actually needs. PEs rarely need all of them.
- **Domain 0, node 0 doesn't exist.** `fcbb:bb00:0000::/48` would be uSID `0x0000`, End-of-Carrier. Start node numbering at 1 in domain 0, or skip that one ID in your IPAM.
- **Don't hand out D = E or F.** It's tempting when you run out of domains. Don't. You'd be colliding with every router's local ID space.
- **Only `::1` to `::f` for loopbacks.** Those fifteen addresses are the ones Cisco documents for this purpose. Don't improvise with other addresses inside the locator; that space belongs to the SIDs the router allocates.
- **Pick the split before the first production router.** Moving from `DNNN` to `DDNN` changes every locator in the network. It's a renumbering project, not a config tweak.

## When NOT to Use This Exact Scheme

- **A single flat IS-IS domain with no plans to split.** You don't need a domain nibble. Spend all 16 bits on node IDs and keep it simple.
- **You have a public /24 you'd rather use.** That works (GUA is supported), but then the `fcbb:bb` part of every example becomes your provider prefix. The structure below the /24 stays the same.
- **Mixed-vendor uSID domains.** The F3216 format and the GIB/LIB split are what this plan relies on. Confirm every vendor in the path supports the same carrier format and local-ID range before you commit.

## Next Steps

- Understand the algorithms you're encoding in `G`: [Segment Routing Flexible Algorithm]({{ '/docs/segment-routing-flexible-algorithm/' | relative_url }}).
- Refresh how IS-IS levels and areas behave before you design the domain borders: [IS-IS vs OSPF]({{ '/docs/isis-vs-ospf/' | relative_url }}).
- See what SRv6 replaces in the forwarding plane: [MPLS Explained]({{ '/docs/mpls-explained/' | relative_url }}).

Maya's plan ended up fitting on one slide: a bit layout, a `G` table, and the rule "domain is a nibble, node is three." Six months later, the acquisition added four new domains. They got `D = 6` through `D = 9`, advertised two summaries each, and nobody touched the core.
