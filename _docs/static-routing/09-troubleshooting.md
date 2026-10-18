---
layout: guide
title: "9. Troubleshooting Static Routes"
slug: "static-routing-troubleshooting"
description: "A repeatable, layer-by-layer checklist for when the static route looks right but traffic still isn't flowing."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Advanced"
read_time: "8 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Troubleshooting"]
---

# 9. Troubleshooting Static Routes

You've now built everything in this course: specific routes, defaults, floating backups, tracking, discard routes, IPv6, and redistribution. This last chapter puts it together into a checklist for when something breaks. Static routing failures are usually simple once you find them; the hard part is not skipping a step because you're sure you know the answer.

## The Core Concept: Follow the Packet, One Question at a Time

A packet goes through a fixed sequence of decisions. Work through them in order, on each router along the path, and stop at the first "no".

1. Is the route **configured**?
2. Is it **installed** in the routing table?
3. Is it actually the route **chosen** for this destination?
4. Does the **forwarding table** agree?
5. Can the router **reach the next-hop** at Layer 2?
6. Is there a **return path**?
7. Is something else on the path **dropping or rewriting** the packet?

## Hands-On: The Checklist with Commands

### 1. Is It Configured?

```text
HQ1# show running-config | include ip route
```

```bash
$ grep -rn "routes" /etc/netplan/
```

Check the prefix *and the mask*. `255.255.255.0` where you meant `255.255.0.0` is still the number one typo ([chapter 2]({{ '/docs/static-routing-first-static-route/' | relative_url }})). On Linux, also check the route survives a reboot: a route added with `ip route add` and never persisted vanishes at the next maintenance window.

### 2. Is It Installed?

```text
HQ1# show ip route static
HQ1# show track brief
```

If the route is configured but missing from the routing table, the cause is almost always one of:

| Cause | Check |
|---|---|
| Exit interface is down | `show ip interface brief` |
| Next-hop doesn't resolve | `show ip route <next-hop>` |
| Track object is down | `show track`, `show ip sla statistics` |
| A route with lower AD exists for the same prefix (it's a floating route doing its job) | `show ip route <prefix>` |
| `ipv6 unicast-routing` missing (IPv6) | `show running-config`, look for `ipv6 unicast-routing` |

### 3. Is It the Route Chosen?

```text
HQ1# show ip route 10.20.1.50
```

```bash
$ ip route get 10.20.1.50
```

Your route can be installed and still not be used, because something **more specific** wins ([chapter 1]({{ '/docs/static-routing-forwarding-basics/' | relative_url }})). Look for stray /32s, a discard route that's too narrow, or a more specific prefix learned from a routing protocol.

### 4. Does the Forwarding Table Agree?

```text
HQ1# show ip cef 10.20.1.50 detail
```

The RIB and the FIB should match. If they don't, you're probably looking at a software or hardware programming issue, which is rare but real. Clearing the route or the CEF table (in a maintenance window) and opening a vendor case are the usual next steps.

### 5. Can It Reach the Next-Hop?

```text
HQ1# show ip arp 192.0.2.2
```

```bash
$ ip neigh show 192.0.2.2
```

An `Incomplete` ARP entry (`FAILED` or `INCOMPLETE` on Linux) means the router has a route but can't find the neighbor's MAC address: wrong VLAN, wrong subnet mask on one side, a dead neighbor, or a cable in the wrong port. If you see ARP entries for *remote* hosts on an Ethernet interface, you've found an exit-interface-only route relying on proxy ARP.

### 6. Is There a Return Path?

Repeat steps 2 to 5 **on the far-end router, for the source address**. Then test end to end with the right source:

```text
BR1# ping 10.10.0.1 source 10.20.1.1
BR1# traceroute 10.10.0.1 source 10.20.1.1
```

A traceroute that reaches the destination but the application still fails often means asymmetric routing: replies return through a different router or firewall that never saw the outgoing packets.

### 7. Is Something Else Dropping It?

Routing can be perfect while the packet still dies. The usual suspects on a static edge:

- **ACLs and firewall policies** on either path.
- **NAT** that only covers some interfaces or some source ranges.
- **uRPF (unicast reverse path forwarding)** in strict mode, which drops packets that arrive on an interface the router wouldn't use to reach their source. Floating routes and asymmetric failover trip strict uRPF easily.

## Worked Example: "We Failed Over, but Nobody Can Reach the Internet"

ISP-A went down. The monitoring dashboard shows HQ1 switched its default route to ISP-B, exactly as designed in chapters 4 and 5, yet users at HQ and at the branch can't reach anything outside. Walking the checklist on HQ1:

- **Configured:** both defaults present.
- **Installed:** `show ip route 0.0.0.0` shows the backup via `198.51.100.1` with AD 250. Tracking worked.
- **Chosen:** `show ip route 172.16.4.4` matches the default. Fine.
- **Next-hop:** `show ip arp 198.51.100.1` has a complete entry. Fine.
- **Return path:** the branch route `10.20.1.0/24` is present. Fine.
- **Something else dropping:** NAT.

```text
HQ1# show running-config | section ip nat
ip nat inside source list NAT-INSIDE interface GigabitEthernet0/2 overload
...
```

NAT only translates traffic leaving Gi0/2 (ISP-A). After failover, packets leave through ISP-B with private source addresses, and the ISP drops them. The fix is one NAT rule per uplink, selected with route-maps:

```text
HQ1(config)# route-map NAT-ISP-A permit 10
HQ1(config-route-map)# match ip address NAT-INSIDE
HQ1(config-route-map)# match interface GigabitEthernet0/2
HQ1(config-route-map)# exit
HQ1(config)# route-map NAT-ISP-B permit 10
HQ1(config-route-map)# match ip address NAT-INSIDE
HQ1(config-route-map)# match interface GigabitEthernet0/3
HQ1(config-route-map)# exit
HQ1(config)# ip nat inside source route-map NAT-ISP-A interface GigabitEthernet0/2 overload
HQ1(config)# ip nat inside source route-map NAT-ISP-B interface GigabitEthernet0/3 overload
```

Remove the old `ip nat inside source list ...` statement as part of the change, make sure Gi0/3 is marked `ip nat outside`, and check that the `NAT-INSIDE` ACL covers the branch range (`10.20.0.0/16`) as well as the HQ LAN.

The routing was right the whole time. The lesson: **a failover test isn't done until real traffic, from every source network, has made it out of the backup path**.

## Symptom Cheat Sheet

| Symptom | Most likely cause | Chapter |
|---|---|---|
| Ping from the router works, from the LAN fails | Missing return route | [2]({{ '/docs/static-routing-first-static-route/' | relative_url }}) |
| Traceroute bounces between two routers | Summary + default loop, missing discard route | [6]({{ '/docs/static-routing-discard-routes/' | relative_url }}) |
| Backup link never used during an outage | No tracking; interface stayed up | [5]({{ '/docs/static-routing-route-tracking/' | relative_url }}) |
| Failover flips back and forth every few seconds | IP SLA probe not pinned to the primary path | [5]({{ '/docs/static-routing-route-tracking/' | relative_url }}) |
| "Backup" path is carrying all the traffic | Floating route AD too low, or backup prefix more specific | [4]({{ '/docs/static-routing-floating-routes/' | relative_url }}) |
| IPv4 fails over, IPv6 doesn't | IPv6 routes/tracking not built separately | [7]({{ '/docs/static-routing-ipv6/' | relative_url }}) |
| Core routers send traffic to a dead edge | Unfiltered redistribution or `default-information originate always` | [8]({{ '/docs/static-routing-with-dynamic-routing/' | relative_url }}) |

## Key Takeaways

- Work through the same checklist every time: configured, installed, chosen, forwarded, next-hop reachable, return path, other drops.
- "Configured but not installed" usually means a down interface, an unresolvable next-hop, a down track, or a floating route working as designed.
- Always test with the source address you care about, and check the far end too.
- Many "routing" outages are NAT, ACL, or uRPF problems on a correctly routed path.

## Where to Go from Here

You've finished the course. Some next steps:

- **Dynamic routing fundamentals:** [Why Routing Protocols Matter]({{ '/docs/importance-of-routing-protocols/' | relative_url }}) covers what changes once routers exchange routes themselves.
- **Choosing an IGP:** [IS-IS vs OSPF: The Ultimate Dogfight]({{ '/docs/isis-vs-ospf/' | relative_url }}) compares the two link-state protocols you'd migrate a growing static network to.
- **Provider backbones:** [MPLS Explained]({{ '/docs/mpls-explained/' | relative_url }}) shows how service providers forward traffic once static and IGP routing aren't enough.
- **Practice:** rebuild the course lab from scratch without looking, then break it in each of the ways listed in the cheat sheet above and fix it using only the checklist.

---

**Previous:** [8. Static Routes in a Dynamic Network]({{ '/docs/static-routing-with-dynamic-routing/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})**
