---
layout: guide
title: "IS-IS vs OSPF: The Ultimate Dogfight"
description: "An architectural showdown between IS-IS and OSPF link-state interior gateway protocols, covering mechanics, scalability, and design trade-offs."
category: "Networking"
difficulty: "Intermediate"
read_time: "8 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "OSPF", "IS-IS", "Protocols"]
---

# IS-IS vs OSPF: The Ultimate Dogfight

Intermediate System to Intermediate System (IS-IS) and Open Shortest Path First (OSPF) are the two dominant link-state Interior Gateway Protocols (IGPs) powering enterprise networks, service provider backbones, and hyperscale data centers. This guide breaks down their shared foundations, deep architectural divergences, real-world operational trade-offs, and how to choose the right IGP for your infrastructure.

## Shared Foundations

Both IS-IS and OSPF were standardized in the late 1980s and early 1990s to replace distance-vector protocols like RIP. At their mathematical core, they operate almost identically:

- **Dijkstra's SPF Algorithm:** Every router in an area (or level) maintains an identical Link-State Database (LSDB) describing that area's topology and runs Dijkstra's algorithm to compute a shortest-path tree to every destination.
- **Triggered Link-State Flooding:** Instead of periodically sending full routing tables, routers flood link-state updates when a link or metric changes. Each advertisement is also refreshed on a long timer (minutes, not seconds).
- **Two-Tier Area Hierarchy:** Both protocols split large networks into a two-level hierarchy to contain flooding and limit the blast radius of SPF recalculations.
- **Equal-Cost Multi-Path (ECMP):** Both protocols load-balance traffic across equal-cost paths natively.
- **Fast Convergence:** Both support fast hello intervals, sub-second SPF throttling, Bidirectional Forwarding Detection (BFD), and Loop-Free Alternate (LFA / TI-LFA) fast reroute.

Despite these common mathematical roots, their transport layers, database abstractions, and area boundary models differ fundamentally.

## Rosetta Stone: Terminology Translation

Engineers crossing over between the two protocols often struggle with naming conventions. Use this mapping table as a reference:

| Concept | OSPF | IS-IS |
|---|---|---|
| Routing Device | Router | Intermediate System (IS) |
| Host / Endpoint | Host | End System (ES) |
| Routing Update Packet | Link-State Advertisement (LSA) | Link-State PDU (LSP) |
| Intra-Area Router | Internal Router (in non-backbone area) | Level 1 (L1) Router |
| Inter-Area Router | Area Border Router (ABR) | Level 1-2 (L1/L2) Router |
| Backbone Router | Backbone Router (Area 0) | Level 2 (L2) Router |
| Central Backbone Domain | Area 0 / Area 0.0.0.0 | Contiguous chain of Level 2 routers |
| Multi-Access Coordinator | Designated Router (DR) | Designated Intermediate System (DIS) |
| Backup Coordinator | Backup Designated Router (BDR) | None (preemption supported) |
| Database Synchronization PDU | Database Description (DBD) | Complete Sequence Number PDU (CSNP) |
| Incremental Acknowledgment | Link-State Acknowledgment (LSAck) | Partial Sequence Number PDU (PSNP) |
| Protocol Data Unit Framing | IP Protocol 89 | Native Layer 2 (Data-Link payload) |

## Architectural Divergence

The engineering decisions made during protocol creation created major differences in scalability, extensibility, and security posture.

### 1. Transport Layer and Protocol Encapsulation

OSPF runs directly on top of IP:

- OSPFv2 (IPv4) runs directly over IPv4 using IP Protocol number **89**.
- OSPFv3 (IPv6) runs over IPv6 using Next Header **89**.
- Because OSPF depends on the IP protocol stack, it is susceptible to Layer 3 IP spoofing, packet fragmentation, and IP stack exhaustion attacks unless secured with cryptographic authentication.

IS-IS is an ISO/OSI protocol (ISO/IEC 10589):

- IS-IS runs directly on the **Data-Link Layer (Layer 2)**: IEEE 802.2 LLC frames on Ethernet, or HDLC/PPP on serial links.
- Its control plane doesn't depend on IP, so IP addressing mistakes on a link don't stop IS-IS PDUs from being exchanged. (MTU still matters: IS-IS pads its hellos to the interface MTU, so an MTU mismatch keeps the adjacency from coming up.)
- IS-IS PDUs can't be routed over IP, so a remote attacker can't send them from across the internet. Only a device attached to the same Layer 2 segment can inject them; use IS-IS authentication (RFC 5304/5310) to cover that case.

> **Note:** Because IS-IS uses OSI framing, routers identify themselves using Network Entity Titles (NETs) based on OSI Network Service Access Point (NSAP) addresses, such as `49.0001.1921.6800.0001.00`, rather than a 32-bit dotted-quad router ID.

### 2. Area Boundaries and Hierarchy

How areas split between routers represents the most dramatic design contrast between the protocols:

```text
OSPF Area Boundaries (Boundary is ON THE ROUTER):
[ Area 1 ] ---- ( ABR: Area 0 + Area 1 ) ---- [ Area 0 ]

IS-IS Area Boundaries (Boundary is ON THE LINK):
[ Area 49.0001 (L1) ] ---( L1/L2 Link )--- [ Area 49.0002 (L2) ]
```

**OSPF: router-centric boundaries.** In OSPF, the boundary between areas sits **inside the Area Border Router (ABR)**:

- An ABR maintains a separate LSDB for each area it connects to.
- Area 0 (the backbone) must be contiguous, and every other area must attach to Area 0 directly (or through a virtual link).
- The result is a hub-and-spoke area design anchored on Area 0.

**IS-IS: link-centric boundaries.** In IS-IS, the area boundary sits **on the link between routers**, not inside the router:

- A single IS-IS router belongs to exactly **one area** (an L1/L2 router keeps separate Level 1 and Level 2 databases).
- Level 1 (L1) routers route within their local area.
- Level 2 (L2) routers route between areas and form the backbone.
- Level 1-2 (L1/L2) routers connect Level 1 domains to the Level 2 backbone.
- The Level 2 backbone is simply any contiguous chain of Level 2 routers; it does not require a rigid, hardcoded "Area 0".

### 3. Multi-Access LAN Handling (DR vs DIS)

When multiple routers share an Ethernet broadcast segment, both protocols elect a coordinator that represents the segment as a single pseudonode. That way each router advertises one link to the pseudonode instead of $N-1$ links to every neighbor. In OSPF, routers also form full adjacencies only with the DR and BDR. IS-IS routers still form adjacencies with every neighbor on the LAN, but the DIS keeps database flooding in check.

- **OSPF Designated Router (DR & BDR):**
  - Elects both a DR and a Backup Designated Router (BDR).
  - OSPF election is **non-preemptive**: once a DR is elected, a newly booted router with higher priority will never overthrow the existing DR. This avoids flapping adjacencies, but can lead to suboptimal coordinator selection after reboots.
- **IS-IS Designated Intermediate System (DIS):**
  - Elects only a primary DIS; there is no backup DIS.
  - IS-IS election is **preemptive**: if a device with a higher priority connects to the broadcast domain, it immediately takes over as the new DIS.
  - The DIS sends periodic Complete Sequence Number PDUs (CSNPs) on the LAN, and all routers are already adjacent to each other, so a new DIS takes over quickly without a dedicated backup.

### 4. Extensibility: Fixed LSAs vs Modular TLVs

Extensibility is a big reason many service providers settled on IS-IS.

- **OSPF:** Uses typed LSAs with fixed formats. OSPFv2 can carry new information in Opaque LSAs (RFC 5250), but IPv6 support required a new protocol version, **OSPFv3 (RFC 5340)**, with its own packet formats and adjacencies. Running dual-stack IPv4 and IPv6 often meant operating OSPFv2 and OSPFv3 side by side.
- **IS-IS:** Built around **Type-Length-Value (TLV)** encoding from the start. New features usually just mean new TLVs or sub-TLVs:
  - IPv4 routing: TLVs 128 and 130 (RFC 1195)
  - Wide metrics / Traffic Engineering: TLVs 22 and 135 (RFC 5305)
  - IPv6 routing: TLV 236 (RFC 5308), or TLV 237 with multi-topology (RFC 5120)
  - SR-MPLS (RFC 8667): Prefix-SID sub-TLV 3 inside TLVs 135/235/236/237, Adj-SID sub-TLVs 31/32 inside TLV 22, and SR-Capabilities sub-TLV 2 inside Router Capability TLV 242
  - SRv6 (RFC 9352): SRv6 Locator TLV 27 and SRv6 Capabilities sub-TLV 25 inside TLV 242

Thanks to TLVs, IS-IS gained IPv6 support by adding new TLVs to the existing process, with no new protocol version.

## Technical Comparison Matrix

| Architectural Feature | OSPF (v2 / v3) | IS-IS |
|---|---|---|
| **Governing Standard** | IETF RFC 2328 (v2), RFC 5340 (v3) | ISO/IEC 10589, IETF RFC 1195 |
| **Encapsulation Layer** | Layer 3 (IP Protocol 89) | Layer 2 (Data-Link Frame / LLC) |
| **Addressing Scheme** | IPv4 / IPv6 addresses + 32-bit Router ID | OSI NET / NSAP address |
| **Area Division** | Inside router (ABR belongs to multiple areas) | On link (Router belongs to one area) |
| **Backbone Requirement** | Rigid Area 0 star hub | Contiguous chain of Level 2 routers |
| **Multi-Access Coordinator** | DR and BDR (non-preemptive) | DIS only (preemptive) |
| **Database Element** | LSA (Link-State Advertisement) | LSP (Link-State PDU) |
| **Packet Formatting** | Rigid header definitions | Modular Type-Length-Value (TLV) |
| **Dual-Stack (IPv4 + IPv6)** | Two processes (v2 + v3) or OSPFv3 address families (RFC 5838) | Single process (TLV 236, or multi-topology TLV 237) |
| **Metric Precision** | 16-bit interface cost (1 to 65,535) | Narrow: 6-bit (1–63); wide: 24-bit link metric |
| **Segment Routing Support** | Opaque LSAs (RFC 8665) | TLVs and sub-TLVs (RFC 8667, RFC 9352) |
| **Campus Hardware Adoption** | Near-universal | Mostly carrier-grade and data center platforms |

## Configuration Walkthrough

The following configuration examples illustrate point-to-point adjacency setup for both protocols on standard network operating systems.

### OSPF Point-to-Point Configuration

```text
! OSPF Point-to-Point IPv4 Adjacency
router ospf 1
 router-id 10.0.0.1
 passive-interface default
 no passive-interface GigabitEthernet0/1
 log-adjacency-changes
!
interface GigabitEthernet0/1
 description Inter-Router Backbone Link
 ip address 10.0.12.1 255.255.255.252
 ip ospf network point-to-point
 ip ospf cost 10
 ip ospf 1 area 0
```

### IS-IS Point-to-Point Configuration

```text
! IS-IS Point-to-Point Dual-Stack (IPv4 + IPv6) Adjacency
router isis CORE
 net 49.0001.0100.0000.0001.00
 is-type level-2-only
 metric-style wide
 log-adjacency-changes
!
interface GigabitEthernet0/1
 description Inter-Router Backbone Link
 ip address 10.0.12.1 255.255.255.252
 ipv6 address 2001:db8:12::1/64
 ip router isis CORE
 ipv6 router isis CORE
 isis network point-to-point
 isis metric 10
```

> **Warning:** Always configure `metric-style wide` on modern networks. Some platforms (including Cisco IOS) still default to narrow metrics, which cap interface cost at 63 and total path metric at 1023. Traffic Engineering and Segment Routing need wide metrics.

## Why Service Providers Choose IS-IS

Many telecom operators, tier-1 ISPs, and large cloud backbones run IS-IS in their core. Key reasons include:

1. **Compact Database:** Each IS-IS router describes itself (links and prefixes) in its own small set of LSPs. OSPF spreads the same information across several LSA types, and inter-area and external prefixes each get their own LSA. In large domains, that means fewer objects to flood and track with IS-IS.
2. **Unified Dual-Stack Routing:** Managing dual-stack IPv4 and IPv6 under one IS-IS process avoids the overhead of running and monitoring parallel OSPFv2 and OSPFv3 instances.
3. **Segment Routing Integration:** SR-MPLS and SRv6 extensions fit naturally into IS-IS TLVs, so backbones can adopt them without changing protocols.
4. **Layer 2 Isolation:** IS-IS PDUs can't be routed over IP, so remote attackers can't reach the control plane. Only devices on the same link can, which authentication covers.

## Why Enterprises Choose OSPF

Corporate campuses, distributed retail branches, financial enterprises, and multi-cloud environments predominantly rely on OSPF:

1. **Ubiquitous Hardware Support:** Nearly every branch router, Layer 3 switch, firewall, and SD-WAN appliance supports OSPFv2. Many mid-range enterprise switches don't support IS-IS, or only with an extra license.
2. **Familiarity and Tooling:** Network engineers, monitoring systems (NMS), and troubleshooting playbooks are built around IP addressing, dotted-quad router IDs, and Area 0 designs.
3. **Virtual Appliance Support:** Virtual routers and firewall appliances commonly support OSPF, so it's easy to extend into cloud networks. Managed cloud gateways such as AWS Virtual Private Gateway and Azure Route Server only speak BGP (or static routes), though, so plan to redistribute at the cloud edge.

## Decision Matrix: Which Should You Deploy?

```text
Do you run a Service Provider, Telco Core, or Large Spine-Leaf Fabric with Segment Routing?
├── YES ──► Choose IS-IS
│           • Cleaner IPv6 dual-stack handling
│           • Native TLV modularity for SR-MPLS / SRv6
│           • Scalable flat L2 backbone designs
└── NO
    └── Are you an Enterprise, Campus, or Multi-Vendor Branch Network?
        ├── YES ──► Choose OSPF
        │           • Broad multi-vendor hardware support
        │           • Native IP troubleshooting familiarity
        │           • Extensive firewall and SD-WAN support
        └── Data Center Fabric?
            └── Consider BGP (eBGP RFC 7938) instead of either IGP
```

## Next Steps

- New to routing protocols? Start with [Why Routing Protocols Matter]({{ '/docs/importance-of-routing-protocols/' | relative_url }}).
- Review the [IPSec Architecture Guide]({{ '/docs/net/' | relative_url }}) to explore securing inter-site links when routing over unencrypted transport.
- For high-reliability deployments, pair your IGP with Bidirectional Forwarding Detection (BFD) to detect failures in milliseconds, and with LFA/TI-LFA fast reroute to restore traffic in under 50 ms.
