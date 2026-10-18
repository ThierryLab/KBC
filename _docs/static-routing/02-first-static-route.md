---
layout: guide
title: "2. Your First Static Route"
slug: "static-routing-first-static-route"
description: "Write static routes with a next-hop, an exit interface, or both, on Cisco IOS, Junos, and Linux, and know which form to pick."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Beginner"
read_time: "7 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Cisco IOS", "Junos", "Linux"]
---

# 2. Your First Static Route

In [chapter 1]({{ '/docs/static-routing-forwarding-basics/' | relative_url }}) we left BR1 knowing only its connected subnets, with no way to reach the HQ LAN. Now we fix that, and look at the three ways to write a static route. They look interchangeable, but they behave differently when something goes wrong.

## The Basic Shape

Every static route answers one question: "for this prefix, where should packets go?" On Cisco IOS the syntax is:

```text
ip route <prefix> <mask> {<next-hop> | <exit-interface> [<next-hop>]} [<distance>] [name <text>]
```

So, on BR1:

```text
BR1(config)# ip route 10.10.0.0 255.255.0.0 192.0.2.1 name TO-HQ-LAN
```

And the router now shows:

```text
BR1# show ip route static
S        10.10.0.0/16 [1/0] via 192.0.2.1
```

The `[1/0]` is administrative distance 1 and metric 0. We'll cover what those numbers mean in [chapter 4]({{ '/docs/static-routing-floating-routes/' | relative_url }}).

### Don't Forget the Return Route

Traffic from the branch now reaches HQ, but HQ1 has no route back to `10.20.1.0/24`. Add it:

```text
HQ1(config)# ip route 10.20.1.0 255.255.255.0 192.0.2.2 name TO-BRANCH-LAN
```

Now test from the branch LAN, **not** from the router's WAN address:

```text
BR1# ping 10.10.0.1 source 10.20.1.1
```

A plain `ping 10.10.0.1` from BR1 uses `192.0.2.2` as its source. HQ1 already has a connected route for that subnet, so the ping succeeds even if the return route is missing. Always test with a source address from the LAN you care about.

## Three Ways to Point a Route

### Next-Hop Only (Recursive)

```text
ip route 10.10.0.0 255.255.0.0 192.0.2.1
```

The router has to do a second lookup to find out how to reach `192.0.2.1`. It finds the connected `192.0.2.0/30` on Gi0/0 and uses that. This is called a **recursive lookup**.

If the next-hop can't be resolved (for example, the connected subnet disappears because Gi0/0 went down), the static route is removed from the routing table. That's good: dead routes don't linger.

The catch: the next-hop can also resolve through *another* non-connected route. If the connected route disappears but some broader route still covers `192.0.2.1`, the static route stays installed and follows that route somewhere you didn't intend. Recursion is flexible, and that flexibility can surprise you.

### Exit Interface Only

```text
ip route 10.10.0.0 255.255.0.0 GigabitEthernet0/0
```

```text
S        10.10.0.0/16 is directly connected, GigabitEthernet0/0
```

The router treats every destination in `10.10.0.0/16` as if it were directly on Gi0/0. On a point-to-point link (serial, GRE tunnel, a /31 link in some setups) that's fine; there's only one device on the other end.

On Ethernet it's a trap. The router sends an **ARP request for every destination address**, not for HQ1. It only works if HQ1 answers on behalf of those addresses with proxy ARP. Many networks disable proxy ARP for security reasons, and even when it works, BR1's ARP table fills with one entry per remote host. Avoid exit-interface-only routes on multi-access interfaces.

### Fully Specified (Interface + Next-Hop)

```text
ip route 10.10.0.0 255.255.0.0 GigabitEthernet0/0 192.0.2.1
```

This is the most explicit form: send traffic out Gi0/0 to `192.0.2.1`. There's no recursive lookup through other routes, no proxy ARP, and the route is removed when Gi0/0 goes down. For production Ethernet links this is usually the best choice. It's also mandatory for IPv6 link-local next-hops, as you'll see in [chapter 7]({{ '/docs/static-routing-ipv6/' | relative_url }}).

| Form | Recursive lookup | Proxy ARP risk | Best for |
|---|---|---|---|
| Next-hop only | Yes | No | Next-hops that aren't directly connected (on purpose) |
| Exit interface only | No | Yes, on Ethernet | Point-to-point links and tunnels |
| Fully specified | No | No | Most Ethernet links |

## The Same Route on Junos and Linux

### Junos

```text
set routing-options static route 10.10.0.0/16 next-hop 192.0.2.1
commit
```

By default Junos requires a static next-hop to sit on a directly connected subnet. If it isn't, the route stays inactive unless you add the `resolve` option, which turns on recursive resolution explicitly. That's a safer default than IOS, where recursion just happens.

### Linux

```bash
sudo ip route add 10.10.0.0/16 via 192.0.2.1 dev eth0
```

Including `dev` gives you the fully specified form. Routes added with `ip route` disappear at reboot. Make them persistent in your network configuration tool. With Netplan:

```yaml
network:
  version: 2
  ethernets:
    eth0:
      addresses: [192.0.2.2/30]
      routes:
        - to: 10.10.0.0/16
          via: 192.0.2.1
```

Then apply it with `sudo netplan apply`. If the box uses NetworkManager or systemd-networkd directly, use their route settings instead. Don't mix tools that fight over the same interface.

## Gotchas and Edge Cases

- **Mask typos change the meaning silently.** `ip route 10.10.0.0 255.255.255.0 ...` installs a /24, not a /16. IOS will reject outright nonsense like `ip route 10.10.1.0 255.255.0.0` (host bits set with that mask), but a valid-but-wrong mask goes through without a warning.
- **Static routes don't check reachability beyond the next-hop.** The route stays up as long as its next-hop resolves, even if everything behind that next-hop is dead. [Chapter 5]({{ '/docs/static-routing-route-tracking/' | relative_url }}) fixes this.
- **Name your routes.** `name` on IOS (or a comment in your config management) costs nothing and saves the next engineer from wondering why a route exists.

## Key Takeaways

- A static route maps a prefix to a next-hop, an exit interface, or both.
- Next-hop-only routes resolve recursively, which is flexible but can follow unexpected paths.
- Exit-interface-only routes on Ethernet depend on proxy ARP; avoid them.
- Fully specified routes are the safest default on Ethernet.
- Always add the return route and test with a LAN source address.

---

**Previous:** [1. How a Router Chooses a Path]({{ '/docs/static-routing-forwarding-basics/' | relative_url }}) · **[Course overview]({{ '/docs/static-routing/' | relative_url }})** · **Next:** [3. Default Routes and Stub Networks]({{ '/docs/static-routing-default-routes/' | relative_url }})
