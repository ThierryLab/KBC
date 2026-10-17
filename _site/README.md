# THE DOC MASTER

A modern, zero-JavaScript-framework documentation template for **GitHub Pages**, built on Jekyll.
Write guides in Markdown, push to GitHub, and get a fast docs site with a collapsible navigation tree,
instant search, light/dark/system themes, and an automatic table of contents.

**Live demo:** https://ThierryLab.github.io/test001/

---

## Contents

1. [Features](#features)
2. [Quick start (GitHub Pages)](#quick-start-github-pages)
3. [Run locally](#run-locally)
4. [Project structure](#project-structure)
5. [Configuration (`_config.yml`)](#configuration-_configyml)
6. [Writing guides](#writing-guides)
7. [Pages without a sidebar](#pages-without-a-sidebar)
8. [Customizing the look](#customizing-the-look)
9. [Keyboard shortcuts](#keyboard-shortcuts)
10. [Troubleshooting](#troubleshooting)

---

## Features

- **Three-level organization**: classification (header tabs) → category → subcategory.
- **Navigation tree** grouped by category → subcategory, with filter, expand/collapse, compact mode, and drag-to-resize.
- **Collapsible sidebar** (header button, `Ctrl+B` or `[`), remembered between visits.
- **Search** (`Ctrl/⌘+K` or `/`) across titles, categories, descriptions and tags.
- **Light / Dark / System theme** with no flash on page load.
- **Guide pages** with breadcrumbs, meta chips, reading-progress bar, "On this page" TOC with scroll highlighting, heading anchors and previous/next links.
- **Code blocks** with language label, syntax highlighting and copy button.
- **Responsive**: mobile drawer navigation, TOC hidden on narrow screens.
- Plain HTML/CSS/JS, no build tools or Node.js required.

---

## Quick start (GitHub Pages)

1. **Create your repository** from this template (or fork / copy the files into a new repo).
2. **Edit `_config.yml`** and set at least:
   ```yaml
   title: "My Project Docs"
   description: "Short description shown on the homepage and in search engines."
   url: "https://<your-user>.github.io"
   baseurl: "/<your-repo-name>"      # use "" if the repo is <your-user>.github.io
   github_url: "https://github.com/<your-user>/<your-repo-name>"
   ```
3. **Enable GitHub Pages via Actions:**
   Repository → **Settings** → **Pages** → **Build and deployment** → **Source** = **GitHub Actions**
   (not "Deploy from a branch").
4. **Push to `main`.** The workflow in `.github/workflows/deploy-jekyll.yml` builds and deploys the site.
5. Open the **Actions** tab, wait for the green check, then visit
   `https://<your-user>.github.io/<your-repo-name>/`.

> The workflow runs on every push to `main` and can also be started manually from the Actions tab (**Run workflow**).

---

## Run locally

Requirements: [Ruby](https://www.ruby-lang.org/) 3.x and Bundler.

```bash
bundle install
bundle exec jekyll serve --livereload
```

Open http://127.0.0.1:4000/<baseurl>/ (for this repo: http://127.0.0.1:4000/test001/).

> Changes to `_config.yml` are **not** picked up by `jekyll serve` automatically. Restart the server after editing it.

On Windows, install Ruby with the [RubyInstaller](https://rubyinstaller.org/) (choose the version *with Devkit*), then run `gem install bundler`.

---

## Project structure

```
.
├── _config.yml              # Site settings, navigation and footer links
├── _docs/                   # Your guides (one Markdown file per page)
├── _includes/               # Reusable page parts
│   ├── head.html            #   <head>, fonts, theme pre-load script
│   ├── header.html          #   top bar: brand, classification tabs, search, theme, sidebar toggle
│   ├── sidebar.html         #   navigation tree (current classification only)
│   ├── breadcrumbs.html     #   Home › Classification › Category › Subcategory
│   ├── classifications.html #   helper: ordered list of classifications
│   ├── class-first-doc.html #   helper: first guide of a classification
│   ├── toc.html             #   "On this page" panel
│   ├── pager.html           #   previous / next guide cards
│   ├── search-modal.html    #   search dialog
│   └── footer.html          #   site footer
├── _layouts/
│   ├── default.html         # Page shell (header, sidebar, footer, scripts)
│   └── guide.html           # Guide page (extends default)
├── assets/
│   ├── css/main.css         # All styles and design tokens
│   └── js/main.js           # Theme, sidebar, tree, TOC, search, shortcuts
├── index.html               # Homepage (search bar + category cards per classification)
├── 404.html                 # Not-found page
├── search.json              # Generated search index
├── Gemfile                  # Ruby dependencies for local builds
└── .github/workflows/       # GitHub Pages deployment
```

---

## Configuration (`_config.yml`)

| Key | Purpose |
|---|---|
| `title` | Site name shown in the header, footer, homepage and browser tab. |
| `description` | Homepage subtitle, footer text and default meta description. |
| `url` | Your GitHub Pages host, e.g. `https://user.github.io`. |
| `baseurl` | Repo sub-path, e.g. `/my-docs`. Use `""` for a user/org site or custom domain. |
| `github_url` | Adds a GitHub icon to the header. Remove the line to hide it. |
| `brand_icon` | Short text (1–2 characters or an emoji) shown in the logo square. `""` hides the square. |
| `brand_tag` | Small badge next to the title (e.g. `Guides`, `v2.0`). `""` hides it. |
| `classifications` | Order of the top-level sections shown as header tabs. Classifications used in guides but not listed here are appended. |
| `defaults` → `classification` | Classification given to guides that don't set one (default `"Docs"`). |
| `nav_links` | Extra header links shown after the classification tabs (hidden on screens under 1024 px). |
| `show_footer` | `false` hides the footer site-wide. |
| `footer_text` | Copyright line at the bottom of the footer. |
| `footer_max_sections` | Max classifications listed in the footer (default `6`). Extra ones are replaced by an "All N sections →" link to the homepage. |
| `footer_links` | Links in the footer "Resources" column. |

### Links: internal vs external

In `nav_links` and `footer_links`:

- **Internal** paths start with `/` and are automatically prefixed with `baseurl`:
  `url: "/docs/introduction/"`
- **External** links must be full URLs (contain `://`) and are used as-is. External footer links open in a new tab:
  `url: "https://github.com/user/repo"`

```yaml
nav_links:
  - title: "Changelog"
    url: "https://github.com/user/repo/releases"
```

A header link is highlighted when its `url` matches the current page.

### Classifications (header tabs)

Guides are organized in three levels:

```
Classification  (header tab)      e.g. Docs, API, Deploy
└─ Category     (sidebar group)   e.g. Getting Started
   └─ Subcategory (sidebar subgroup) e.g. Fundamentals
      └─ Guide
```

- Each header tab links to the first guide of that classification.
- The sidebar, previous/next links and the active tab only show guides from the **current** classification.
- The homepage shows one section of category cards per classification; search covers all of them.
- On screens under 1024 px the tabs move to the top of the sidebar.

**Add a new classification:** set `classification: "Tutorials"` in a guide's front matter. The tab appears automatically.
To control the order, add it to the list in `_config.yml`:

```yaml
classifications:
  - "Docs"
  - "Tutorials"
  - "API"
  - "Deploy"
```

**Rename a classification:** change the value in every guide that uses it (and in `classifications` / `defaults`).

---

## Writing guides

### 1. Create a file

Add a Markdown file to `_docs/`. The file name becomes the URL:

```
_docs/getting-started.md  →  /docs/getting-started/
```

### 2. Add front matter

```yaml
---
layout: guide
title: "Getting Started"
description: "One-sentence summary shown under the title, on cards and in search."
classification: "Docs"
category: "Getting Started"
subcategory: "Fundamentals"
difficulty: "Beginner"
read_time: "5 min"
last_updated: "October 2026"
tags: ["Setup", "Install"]
---
```

| Field | Required | Used for |
|---|---|---|
| `layout` | no | `guide` (set automatically for files in `_docs/`). |
| `title` | yes | Page title, sidebar, search, pager, homepage cards. |
| `description` | recommended | Lead paragraph, search results, SEO meta description. |
| `classification` | optional | Header tab the guide belongs to. Defaults to `"Docs"` (see `defaults` in `_config.yml`). |
| `category` | recommended | Group in the sidebar, homepage card and breadcrumbs. |
| `subcategory` | optional | Second-level group in the sidebar. Omit it to list the guide directly under its category. |
| `difficulty` | optional | Chip under the title. |
| `read_time` | optional | Chip under the title and on homepage cards. |
| `last_updated` | optional | Chip under the title. |
| `tags` | optional | Extra search keywords. |
| `show_footer` | optional | `false` hides the footer on this page only. |

### 3. Write the content

```markdown
# Getting Started

Intro paragraph…

## Installation

Steps…

### Windows

Details…
```

- The first `# Heading` in a guide is hidden, because the layout already shows `title` as the page heading. You can keep it or remove it.
- Every `##` and `###` heading appears in the **On this page** panel and gets a `#` anchor link.
- Fenced code blocks get syntax highlighting, a language label and a **Copy** button. Always specify the language:

  ````markdown
  ```bash
  npm install
  ```
  ````

  Highlighting is included for TypeScript/JavaScript, Python, Go, Rust, Bash, JSON, CSS and HTML.
  To add more languages, add a Prism component script in `_layouts/default.html`, e.g.
  `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-yaml.min.js`.
- Blockquotes (`> Note: …`) are styled as callouts; tables scroll horizontally on small screens.

### Ordering

Classifications follow the `classifications` list in `_config.yml`. Within a classification, guides are ordered by **file name**, and categories appear in the order their first guide appears.
To control order, prefix file names with numbers and keep the URL clean with a `permalink`:

```yaml
# _docs/01-introduction.md
permalink: /docs/introduction/
```

The same order is used by the sidebar, homepage cards, footer and previous/next links.

### Linking between guides

Always use `relative_url` so links work with any `baseurl`:

```liquid
[Read the API reference]({{ '/docs/api-reference/' | relative_url }})
```

---

## Pages without a sidebar

Any page can hide the navigation tree with `sidebar: false`. The homepage and 404 page already do this.
Use the `default` layout for standalone pages (about, changelog, etc.):

```yaml
---
layout: default
title: "Changelog"
sidebar: false
---
```

---

## Customizing the look

All styles are in `assets/css/main.css`. Most changes only need the **design tokens** at the top of the file:

```css
:root {                         /* light theme */
  --accent: #0284c7;
  --accent-hover: #0369a1;
  --bg: #ffffff;
  --text: #09090b;
  --sidebar-w: 280px;           /* default sidebar width */
  --header-h: 60px;
}
[data-theme="dark"] {           /* dark theme */
  --accent: #38bdf8;
  --bg: #09090b;
}
```

| What | Where |
|---|---|
| Accent / brand color | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-active` in both theme blocks, plus the gradients in `.brand-icon` and `.not-found-code`. |
| Fonts | Google Fonts `<link>` in `_includes/head.html` and `--font-sans` / `--font-mono` in `main.css`. |
| Logo letter / badge | `brand_icon` and `brand_tag` in `_config.yml`. For an image logo, edit `brand-icon` in `_includes/header.html` and `_includes/footer.html`. |
| Homepage search bar and cards | `index.html`. |
| Footer columns | `_includes/footer.html`. |
| 404 text | `404.html`. |

### Theme behavior

- The theme button cycles **Light → Dark → System**. **System** follows the OS setting and updates live.
- New visitors get **System**. The choice is saved in the browser (`localStorage`).

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `⌘K` or `/` | Open search |
| `↑` `↓` then `Enter` | Choose a search result |
| `Esc` | Close search / mobile menu, or clear the sidebar filter |
| `Ctrl+B` or `[` | Show / hide the sidebar (desktop) |

Double-click the sidebar edge to reset its width.

---

## Troubleshooting

**The site shows 404 on GitHub Pages**
- Settings → Pages → Source must be **GitHub Actions**.
- Check the **Actions** tab for a failed run and open its log.
- The first deployment can take a few minutes.

**Page loads but has no styles, or links are broken**
- `baseurl` doesn't match the repository name. For `github.com/user/my-docs` use `baseurl: "/my-docs"`.
- For a user site (`user.github.io` repo) or a custom domain use `baseurl: ""`.
- Use `relative_url` for any internal link you write by hand.

**A new guide doesn't appear**
- The file must be in `_docs/` and start with front matter (`---` lines).
- Check that `layout: guide` and `title` are set.
- Locally, restart `jekyll serve` if you changed `_config.yml`.

**A header tab is missing, outdated or differs between pages**
- A tab exists as long as at least one guide uses that classification. Guides without `classification` count as the default (`"Docs"`).
- Locally, don't use `jekyll serve --incremental`: it only rebuilds changed pages, so other pages keep the old header. Restart the server after editing `_config.yml`.
- GitHub Pages caches pages for about 10 minutes. After a deploy, hard-refresh (`Ctrl+Shift+R` / `⌘+Shift+R`).

**Search returns nothing**
- Open `<site>/search.json` in the browser. It should list your guides.
- Search covers titles, categories, subcategories, descriptions and tags, not the full page text.

**Code isn't highlighted**
- Add the language after the opening fence (```` ```python ````) and make sure its Prism component is loaded in `_layouts/default.html`.

**Sidebar/theme looks "stuck"**
- Settings are stored in the browser. Clear site data, or run `localStorage.clear()` in the browser console.

---

## License

MIT. Use it, modify it, ship it.
