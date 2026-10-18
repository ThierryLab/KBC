---
layout: guide
title: "3. Default Routes and Stub Networks"
slug: "static-routing-default-routes"
description: "Use a single 0.0.0.0/0 route to give stub networks a way out, and learn what a default route quietly does to traffic you didn't plan for."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Beginner"
read_time: "6 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Default Route"]
---

# 3. Default Routes and Stub Networks

In [chapter 2]({{ '/docs/static-routing-first-static-route/' | relative_url }}) BR1 got a route to the HQ LAN. But the branch also needs the internet, the data center, a SaaS VPN, and whatever HQ adds next quarter. You could add a static route for each. Or you could notice that BR1 only has one way out and say so in one line.

## The Core Concept: The Route That Matches Everything

A default route is a static route for `0.0.0.0/0`. A /0 prefix has zero fixed bits, so it contains every IPv4 address. Because of longest-prefix match (see [chapter 1]({{ '/docs/static-routing-forwarding-basics/' | relative_url }})), it's also the **least** specific route possible. It only wins when nothing else matches.

That makes it the "everything else" route: specific routes handle what they know, and the default catches the rest.

### Stub Networks

A **stub network** has exactly one path to the rest of the world. Branch offices, small sites, a lab, a home network: if every non-local packet leaves through the same link, there's no routing decision to make. A default route expresses that perfectly, and it's why stub sites are where static routing shines.

## Hands-On: Defaults for BR1, HQ1, and SRV1

### BR1: Everything Goes to HQ

```text
BR1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/0 192.0.2.1 name DEFAULT-TO-HQ
```

```text
BR1# show ip route
...
Gateway of last resort is 192.0.2.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 192.0.2.1, GigabitEthernet0/0
S     10.10.0.0/16 [1/0] via 192.0.2.1
...
```

The `*` marks the candidate default, and IOS calls its next-hop the **gateway of last resort**. You can now delete the `10.10.0.0/16` route from chapter 2 since the default covers it. Leaving it is harmless, but every extra route is one more thing to keep in sync.

### HQ1: Everything Unknown Goes to ISP-A

HQ1 isn't a stub (it has two uplinks), but for now give it a single default toward the primary ISP. [Chapter 4]({{ '/docs/static-routing-floating-routes/' | relative_url }}) adds the backup.

```text
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/2 203.0.113.1 name DEFAULT-ISP-A
```

HQ1 still needs its specific route back to the branch (`10.20.1.0/24` via `192.0.2.2`). The default can't replace it, because the branch is *not* behind ISP-A.

### SRV1: The Host's Default Gateway

On a host, the default route *is* the "default gateway" setting. You already saw SRV1's in chapter 1: it points at BR1's LAN address. Setting it by hand looks like this:

```bash
sudo ip route replace default via 10.20.1.1 dev eth0
```

`replace` adds the route or overwrites an existing default, so it won't fail with `File exists`. On Linux, `default` is shorthand for `0.0.0.0/0`. To make it permanent, use `- to: default` under `routes:` in Netplan, as in [chapter 2]({{ '/docs/static-routing-first-static-route/' | relative_url }}).

## Two Defaults at Once

What if HQ1 gets two default routes with the same administrative distance?

```text
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/2 203.0.113.1
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/3 198.51.100.1
```

Both get installed and the router load-shares across them (ECMP), hashing each flow onto one link. With two different ISPs that's usually **not** what you want: each ISP only accepts your traffic from the addresses it assigned you, so you'd need NAT per link, and stateful firewalls hate the asymmetric return traffic. For a primary/backup design, use a floating route instead (next chapter).

Hosts hit the same problem from another angle. If SRV1 picked up a second default route on `eth1` (a DHCP server on the management network is the usual culprit), some of its internet traffic would leave through the management network. Adding a second default with the same metric by hand fails with `RTNETLINK answers: File exists`; a DHCP-learned one typically arrives with a different metric and quietly wins or loses. Either way, check `ip route show default` on multi-homed hosts and keep exactly one default.

## Gotchas and Edge Cases

- **A default route forwards garbage too.** With a default in place, traffic to a subnet that doesn't exist yet doesn't get dropped locally; it travels upstream. Branch typos and scanning malware end up crossing your WAN. Worse, if HQ1 forwards private-address traffic to the internet, it leaks to your ISP. [Chapter 6]({{ '/docs/static-routing-discard-routes/' | relative_url }}) uses discard routes to stop this.
- **A default plus a summary can loop.** Say HQ1 routes the whole branch range `10.20.0.0/16` to BR1, but only `10.20.1.0/24` actually exists there. A packet for `10.20.9.9` goes to BR1, which has no specific match and sends it back up its default to HQ1, which sends it back to BR1. The packet bounces until its TTL hits zero. A traceroute that alternates between the same two hops is the classic sign.
- **`ip default-gateway` is not a default route.** On Cisco devices, `ip default-gateway` is only used when IP routing is disabled (typical on Layer 2 switches for management traffic). On a router, use `ip route 0.0.0.0 0.0.0.0 ...`.
- **Defaults hide reachability problems.** Because the default always matches, the router never says "no route to host". You find out when the application times out.

## Key Takeaways

- `0.0.0.0/0` matches everything, but loses to any more specific route.
- Stub networks with a single exit are the best fit for a static default.
- Two equal defaults mean load-sharing, not backup. Usually that isn't what you want across ISPs.
- A default route forwards traffic for destinations that don't exist; plan for that.

---

**Previous:** [2. Your First Static Route]({{ '/docs/static-routing-first-static-route/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})** · **Next:** [4. Administrative Distance and Floating Static Routes]({{ '/docs/static-routing-floating-routes/' | relative_url }})
