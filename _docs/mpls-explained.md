---
layout: guide
title: "MPLS Explained: Forwarding on Labels Instead of Lookups"
description: "How MPLS swaps labels instead of routing on IP addresses, what the routers along a label-switched path actually do, and why providers built their backbones on it."
category: "Networking"
difficulty: "Intermediate"
read_time: "6 min"
last_updated: "October 2026"
tags: ["Networking", "MPLS", "LDP", "Service Provider", "Routing"]
---

# MPLS Explained: Forwarding on Labels Instead of Lookups

Multiprotocol Label Switching (MPLS) is the reason a service provider can carry your company's VPN, someone else's Ethernet circuit, and plain internet traffic over the same backbone without any of them knowing about each other. This guide walks through the mental model: how normal IP forwarding works, what changes when labels show up, which router does what, and the few gotchas that bite people on their first MPLS deployment.

It's based on the original Spanish-language post [Multiprotocol Label Switching - MPLS](https://www.thierry-lab.com/post/multiprotocol-label-switching-mpls) on Thierry-LAB, expanded with packet details and a working config.

## Prerequisites

- Comfortable with IP routing, routing tables, and next hops.
- Familiar with at least one IGP such as OSPF or IS-IS. If not, start with [Why Routing Protocols Matter]({{ '/docs/importance-of-routing-protocols/' | relative_url }}).

## First, Plain IP Forwarding

Without MPLS, every router makes the same decision independently:

1. A packet arrives.
2. The router looks up the **destination IP address** in its routing table (on Cisco gear, the CEF table).
3. No matching route? The packet is dropped.
4. Match found? It's sent to the next hop, and the next router repeats the whole lookup from scratch.

That works, but it ties forwarding to the destination IP. Every core router needs a route for every destination it carries, and the only thing that steers traffic is the destination address.

## The MPLS Idea: Decide Once, Then Follow the Label

With MPLS, the first router at the edge of the network classifies the packet once and **pushes a label** onto it based on where it needs to exit. From then on, routers in the core don't need the IP header to forward it. They read the label, swap it for a new one, and forward.

The group of packets that get the same treatment (usually "everything heading to the same egress router") is called a **Forwarding Equivalence Class (FEC)**.

### Where the Label Lives

The MPLS header is a 32-bit "shim" inserted between the Layer 2 header and the Layer 3 packet. On Ethernet, the frame's EtherType becomes `0x8847` (MPLS unicast).

| Field | Bits | Purpose |
|---|---|---|
| Label | 20 | The value routers switch on |
| TC (Traffic Class) | 3 | QoS marking; called EXP before RFC 5462 |
| S (Bottom of Stack) | 1 | Set on the last label when several are stacked |
| TTL | 8 | Loop protection, just like the IP TTL |

Labels can be stacked. That's how services like L3VPNs work: an outer label gets the packet across the core, and an inner label tells the egress router which customer it belongs to.

## The Routers on a Label-Switched Path

Routers that speak MPLS are called **Label Switching Routers (LSRs)**. On any given path they play one of three roles:

| Role | Also called | What it does |
|---|---|---|
| **Ingress LSR** | Ingress edge router, PE | First router in the MPLS network. Classifies the packet and **pushes** the first label. |
| **Intermediate LSR** | Transit LSR, P router | Reads the incoming label, **swaps** it for the outgoing label, forwards. |
| **Egress LSR** | Egress edge router, PE | Last router. **Pops** the remaining labels and hands the packet back to normal forwarding. |

The path a packet follows from ingress to egress is a **Label Switched Path (LSP)**. LSPs are one-way, and roles depend on traffic direction: the egress LSR for traffic going east is the ingress LSR for the return traffic going west.

```text
             push 17           swap 17 -> 22           pop 22 (PHP)
 [CE] --> [Ingress LSR] --> [Intermediate LSR] --> [Intermediate LSR] --> [Egress LSR] --> [CE]
             PE1                  P1                      P2                   PE2
```

### Why Labels Change at Every Hop

Unlike an IP address, a label only has meaning between two neighboring routers. Each LSR picks its own local label for each FEC and tells its neighbors about it. When a packet arrives, the router looks up the incoming label in its **Label Forwarding Information Base (LFIB)**, swaps in the label the next hop asked for, and sends it on.

A simplified LFIB entry on P1 from the diagram above:

```text
Local   Outgoing   Prefix          Next Hop
Label   Label      (FEC)
17      22         10.0.0.4/32     10.1.23.2  (P2)
```

### Penultimate Hop Popping

Notice that P2 pops the label instead of swapping it. PE2 advertised the reserved **implicit-null** label (value 3) for its own loopback, which tells the second-to-last router to remove the outer label before forwarding. This is **Penultimate Hop Popping (PHP)**, and it saves the egress router from doing two lookups (one on the label, then one on the IP header).

That's why the original article says the swapping repeats "until the packet reaches the last (or penultimate) router".

## How Routers Agree on Labels

Labels don't appear by magic. Something has to distribute them:

- **LDP** (Label Distribution Protocol, RFC 5036): the classic choice. It follows the IGP and binds labels to the prefixes it learns (which prefixes get labels by default varies by vendor).
- **RSVP-TE**: builds explicit, traffic-engineered LSPs, optionally with reserved bandwidth.
- **BGP**: distributes labels for VPN prefixes (MP-BGP for L3VPNs) and between autonomous systems.
- **Segment Routing**: carries labels directly inside OSPF or IS-IS, no LDP needed.

## Why Providers Love It

- **Protocol-agnostic transport.** Core LSRs never look past the label, so the payload can be IPv4, IPv6, or a whole Layer 2 frame (Ethernet, PPP, HDLC, Frame Relay). Cisco calls carrying Layer 2 over MPLS **Any Transport over MPLS (AToM)**; the standards term is pseudowires.
- **BGP-free core.** P routers only need labels for the provider's own loopbacks. Full internet and customer routes live on the edge routers, so the core runs a small IGP plus LDP.
- **One network, many services.** L3VPNs (RFC 4364), L2VPNs, internet transit, and traffic engineering all share the same backbone instead of separate networks per service.

## Hands-On: Enabling LDP on Cisco IOS

This is the minimum to get labels flowing between two directly connected routers that already run an IGP and advertise their loopbacks.

```text
! Use a stable loopback as the LDP router ID
mpls label protocol ldp
mpls ldp router-id Loopback0 force
!
interface GigabitEthernet0/1
 description Core link to P1
 ip address 10.1.12.1 255.255.255.252
 mpls ip
```

Then verify:

```text
show mpls ldp neighbor
show mpls forwarding-table
```

You should see the neighbor in `Oper` state and an LFIB entry for each remote loopback.

## Gotchas That Bite in Production

- **MTU.** Every label adds 4 bytes. Two labels on a 1500-byte IP packet make a 1508-byte payload before the Ethernet header is even added. Raise the core MTU or you'll see mysterious drops on large packets.
- **Summarized loopbacks.** LDP only uses a label for a prefix if the routing table has an exact match for it (RFC 5036). If you summarize PE loopbacks in the IGP, the `/32` disappears and the LSP breaks. Keep loopbacks as `/32` host routes in the core.
- **LDP and IGP out of sync.** After a link comes back, the IGP may send traffic over it before LDP has exchanged labels, which black-holes MPLS traffic. Enable LDP-IGP synchronization (`mpls ldp sync` under OSPF or IS-IS on Cisco).
- **Traceroute looks strange.** By default the IP TTL is copied into the label, so customers can see your core hops. Many providers hide them with `no mpls ip propagate-ttl`.

## When You Don't Need MPLS

If you run a single campus or a handful of branches over the internet, running your own MPLS network adds complexity without much payoff (buying an MPLS VPN service from a provider is a different story). It shines when you're carrying many customers or services over a shared backbone, need traffic engineering, or want a BGP-free core.

## Next Steps

- Compare the IGPs that MPLS networks run underneath in [IS-IS vs OSPF: The Ultimate Dogfight]({{ '/docs/isis-vs-ospf/' | relative_url }}).
- Read the original post on [Thierry-LAB](https://www.thierry-lab.com/post/multiprotocol-label-switching-mpls), along with its follow-ups on Inter-AS L3VPN and Carrier Supporting Carrier.
