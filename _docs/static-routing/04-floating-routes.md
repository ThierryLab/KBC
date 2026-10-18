---
layout: guide
title: "4. Administrative Distance and Floating Static Routes"
slug: "static-routing-floating-routes"
description: "How routers rank routes from different sources, and how to use that ranking to keep a backup static route waiting in the wings."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Intermediate"
read_time: "7 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Administrative Distance", "Failover"]
---

# 4. Administrative Distance and Floating Static Routes

At the end of [chapter 3]({{ '/docs/static-routing-default-routes/' | relative_url }}) HQ1 had one default route to ISP-A, and adding a second equal default to ISP-B just load-shared traffic across two providers. What we actually want is "use ISP-A, and only fall back to ISP-B when ISP-A is gone." That's a floating static route, and it relies on administrative distance.

## The Core Concept: Trust Ranking for Route Sources

A router can learn the exact same prefix from several sources: a static route, OSPF, BGP. It needs a way to decide which source to believe. **Administrative distance** (AD) is that ranking: a number per route source, and lower is more trusted. Junos calls it **route preference**, with the same idea and different numbers.

| Source | Cisco IOS AD | Junos preference |
|---|---|---|
| Connected / direct | 0 | 0 |
| Static | 1 | 5 |
| eBGP | 20 | 170 (BGP) |
| OSPF internal | 110 | 10 |
| IS-IS (Level 2 internal) | 115 | 18 |
| RIP | 120 | 100 |
| OSPF external | 110 | 150 |
| iBGP | 200 | 170 (BGP) |

The two vendors disagree a lot. On IOS, eBGP beats OSPF; on Junos, OSPF internal routes beat BGP. Don't carry AD numbers from one platform to another.

### The Full Selection Order

Putting [chapter 1]({{ '/docs/static-routing-forwarding-basics/' | relative_url }}) together with this one, a router picks a route like this:

1. **Longest-prefix match** decides which prefix is used.
2. **Administrative distance** decides which *source* wins for that exact prefix.
3. **Metric** decides among routes from the same source.

Linux has no AD concept. It just uses the route `metric`, where lower wins.

## Floating Static Routes

A static route's AD isn't fixed at 1. You can set it on each route. Give the backup route a higher AD than the primary, and it sits in the configuration but stays out of the routing table, "floating" above the primary. When the primary disappears, the backup is the best remaining candidate and gets installed.

### Hands-On: Primary ISP-A, Backup ISP-B

```text
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/2 203.0.113.1 name DEFAULT-ISP-A
HQ1(config)# ip route 0.0.0.0 0.0.0.0 GigabitEthernet0/3 198.51.100.1 250 name DEFAULT-ISP-B-BACKUP
```

```text
HQ1# show ip route static
S*    0.0.0.0/0 [1/0] via 203.0.113.1, GigabitEthernet0/2
```

Only the primary shows up. The backup is visible in `show running-config | include ip route` but not in the routing table. That confuses people the first time: the route isn't missing, it's waiting.

Now shut Gi0/2 to simulate a failure:

```text
HQ1(config)# interface GigabitEthernet0/2
HQ1(config-if)# shutdown
```

```text
HQ1# show ip route static
S*    0.0.0.0/0 [250/0] via 198.51.100.1, GigabitEthernet0/3
```

Bring Gi0/2 back up, and the AD-1 route returns and immediately replaces the backup.

### Junos

```text
set routing-options static route 0.0.0.0/0 next-hop 203.0.113.1
set routing-options static route 0.0.0.0/0 qualified-next-hop 198.51.100.1 preference 250
```

A `qualified-next-hop` lets one static route carry several next-hops, each with its own preference.

### Linux

```bash
sudo ip route add default via 203.0.113.1 dev eth2 metric 100
sudo ip route add default via 198.51.100.1 dev eth3 metric 250
```

Both routes appear in `ip route`, and the lower metric wins.

## Backing Up a Dynamic Route

Floating statics are also the classic way to back up a routing protocol. Say BR1 normally learns `10.10.0.0/16` from OSPF over an MPLS circuit, and you want an IPsec tunnel as a backup. The static backup's AD must be **higher** than the protocol it's backing up:

| Primary learned via (IOS) | Backup static AD must be greater than |
|---|---|
| eBGP | 20 |
| OSPF | 110 |
| iBGP | 200 |

The mistake that bites people: setting a "backup" static to AD 100 behind OSPF. 100 is lower than 110, so the static wins and becomes your primary. Traffic goes through the tunnel while the MPLS circuit sits idle, and nobody notices until someone reads the bill.

## Gotchas and Edge Cases

- **The backup must have the exact same prefix.** A floating static for `10.10.0.0/17` isn't a backup for a primary `10.10.0.0/16`; it's more specific, so longest-prefix match picks it for half the HQ LAN, whatever its AD.
- **A floating route only activates when the primary leaves the routing table.** For a static primary, that means its interface went down or its next-hop stopped resolving. If ISP-A's upstream dies but the cable to their router stays up, Gi0/2 stays up, the primary stays installed, and you have an outage with a perfectly good backup sitting unused. This is the biggest weakness of plain static failover, and [chapter 5]({{ '/docs/static-routing-route-tracking/' | relative_url }}) fixes it.
- **Linux keeps routes on links with no carrier.** When a cable is pulled, Linux marks routes `linkdown` but can keep using them. Set `net.ipv4.conf.all.ignore_routes_with_linkdown=1` if you want failover on carrier loss.
- **Failback is instant and automatic.** A flapping primary link flips traffic back and forth every time it bounces. Long-lived sessions (VoIP, VPNs, NAT state) break on every flip. Tracking with delays (next chapter) helps damp this.

## Key Takeaways

- Selection order: longest prefix, then administrative distance, then metric.
- Lower AD wins; static routes default to 1 on IOS and 5 on Junos, but you can set any value per route.
- A floating static route has a higher AD than the primary and only installs when the primary disappears.
- To back up a dynamic protocol, the floating static's AD must be higher than that protocol's AD.
- Plain floating routes only react to local link or next-hop failures, not to failures further upstream.

---

**Previous:** [3. Default Routes and Stub Networks]({{ '/docs/static-routing-default-routes/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})** · **Next:** [5. Making Static Routes Detect Failures]({{ '/docs/static-routing-route-tracking/' | relative_url }})
