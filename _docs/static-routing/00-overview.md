---
layout: guide
title: "Static Routing: Course Overview"
slug: "static-routing"
description: "A hands-on course on static routes: how they work, how to make them fail over safely, and where they belong next to dynamic routing."
classification: "Network Engineering"
category: "Networking"
subcategory: "Static Routing"
difficulty: "Beginner"
read_time: "3 min"
last_updated: "October 2026"
tags: ["Networking", "Routing", "Static Routes", "Course"]
---

# Static Routing: Course Overview

Static routes look trivial: one line of config and traffic flows. That's why they're everywhere, from the default route on a branch router to the discard route anchoring a BGP aggregate. They're also behind many outages: a backup route that never takes over, a probe that tests the wrong path, a default route pointing two routers at each other.

This course takes you from "what does `ip route` actually do?" to designing static routes that fail over cleanly and sit alongside OSPF or BGP without causing trouble.

## Who This Course Is For

- Junior network engineers who configure static routes but want to know exactly what the router does with them.
- Sysadmins and cloud engineers who manage routing tables on multi-homed Linux servers.
- Anyone preparing to run branch or edge networks where static routing is still the right tool.

## Prerequisites

- IPv4 addressing and subnetting (prefixes, masks, CIDR notation).
- Basic CLI comfort with Cisco IOS (router examples) and Linux (host examples).
- Helpful but optional: [Why Routing Protocols Matter]({{ '/docs/importance-of-routing-protocols/' | relative_url }}) for the bigger picture of static vs dynamic routing.

## What You'll Learn

- How a router picks a route: longest-prefix match first, administrative distance second, metric last.
- How to write static routes with a next-hop, an exit interface, or both, and when each one is the right choice.
- How to build default routes and floating static routes for backup links.
- How to make static routes react to real failures with IP SLA tracking and BFD.
- How to use discard (Null0) routes to stop loops and anchor summaries.
- How IPv6 static routes differ, especially with link-local next-hops.
- How to manage static routes on a multi-homed Linux host: extra routes, a single default, metrics, and persistence with Netplan.
- How to redistribute static routes into OSPF and BGP safely, and how to troubleshoot a broken static route step by step.

## Syllabus

1. [How a Router Chooses a Path]({{ '/docs/static-routing-forwarding-basics/' | relative_url }}): the routing table, connected routes, and longest-prefix match.
2. [Your First Static Route]({{ '/docs/static-routing-first-static-route/' | relative_url }}): next-hop, exit-interface, and fully specified routes on Cisco IOS, plus static routes on a Linux host.
3. [Default Routes and Stub Networks]({{ '/docs/static-routing-default-routes/' | relative_url }}): the gateway of last resort and why branches love it.
4. [Administrative Distance and Floating Static Routes]({{ '/docs/static-routing-floating-routes/' | relative_url }}): ranking route sources and building a backup path.
5. [Making Static Routes Detect Failures]({{ '/docs/static-routing-route-tracking/' | relative_url }}): IP SLA object tracking and BFD for static routes.
6. [Discard Routes, Summaries, and Loop Prevention]({{ '/docs/static-routing-discard-routes/' | relative_url }}): Null0, blackhole, and why summaries need them.
7. [IPv6 Static Routes]({{ '/docs/static-routing-ipv6/' | relative_url }}): global vs link-local next-hops and the interface rule.
8. [Static Routes in a Dynamic Network]({{ '/docs/static-routing-with-dynamic-routing/' | relative_url }}): redistribution into OSPF and BGP, tags, and when to stop using static.
9. [Troubleshooting Static Routes]({{ '/docs/static-routing-troubleshooting/' | relative_url }}): a repeatable checklist for when "the route is there but traffic isn't".

## How to Use This Course

Each chapter takes 5 to 9 minutes to read. Chapters 1 to 3 are the foundation; if you already know longest-prefix match and default routes cold, skim them and start at chapter 4. Chapters 4 to 6 are where most production mistakes happen, so read them carefully.

The examples use one small lab all the way through: a branch router, an HQ router, two internet uplinks, and a Linux server. Router configs are Cisco IOS; host configs are Linux. Rebuild it in a lab tool such as Containerlab, GNS3, or EVE-NG and type the configs yourself. Watching `show ip route` change after each command teaches more than reading about it.

![Course lab topology with routers BR1 and HQ1, the branch and HQ LANs, ISP-A and ISP-B uplinks, and Linux server SRV1]({{ '/assets/diagrams/static-routing-lab.drawio.png' | relative_url }})

---

**Start here:** [1. How a Router Chooses a Path]({{ '/docs/static-routing-forwarding-basics/' | relative_url }})
