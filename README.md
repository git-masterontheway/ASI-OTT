<div align="center">

  <img src="public/logo.png" alt="ASI OTT Brand Logo" width="380">

  # ASI OTT
  ### Modern Multi-Source Content Aggregation & High-Performance Streaming Platform

  **Developed by Amar Kumar**

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](package.json)
  [![Express](https://img.shields.io/badge/Backend-Express.js%204.x-blue.svg)](server.js)
  [![Deploy on Render](https://img.shields.io/badge/Deploy-Render-46E3B7.svg)](render.yaml)
  [![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-black.svg)](vercel.json)
  [![Open Source](https://img.shields.io/badge/Open%20Source-%E2%99%A5-ff69b4.svg)](https://github.com/git-masterontheway/ASI-OTT)

  <p align="center">
    A state-of-the-art, open-source streaming platform that seamlessly aggregates movies, web series, TV shows, and vertical mini dramas across high-speed sources with horizontal on-site video playback and zero-redirect direct cloud downloads.
  </p>

</div>

---

## 📖 Open Source Notice

**ASI OTT is 100% open source and available for anyone to use, learn from, fork, and build upon**, subject to the terms of the [MIT License](LICENSE). Contributions, suggestions, and improvements are always welcome!

---

## 🌐 Live Project Access

You can access and test the live running deployment of ASI OTT through any of the following official mirrors (listed in order of preference):

1. **Primary Domain:**  
   👉 [**https://asi-ott.xo.je**](https://asi-ott.xo.je/)  
   *Custom production domain with global CDN acceleration and direct cloud delivery.*

2. **Secondary Mirror (Vercel Serverless Edge):**  
   👉 [**https://asi-ott.vercel.app**](https://asi-ott.vercel.app/)  
   *Serverless edge deployment powered by Vercel for fast global asset delivery.*

3. **Alternative Mirror (Render Web Service):**  
   👉 [**https://asi-ott.onrender.com**](https://asi-ott.onrender.com/)  
   *Persistent backend container on Render with automated scraping memory caching.*

> **Note on Service Availability:**  
> Availability and response time on the secondary and alternative mirrors may occasionally depend on cloud provider deployment cycles or free-tier instance spin-up (e.g., Render free services may take 30-50 seconds to wake from idle). If one mirror is temporarily updating, switch to the primary domain.

---

## ✨ Key Features & Architecture

- **Multi-Source Real-Time Aggregator:** Simultaneously aggregates and deduplicates catalog titles from top high-speed providers with automatic mirror resolution.
- **Clean Content Masking:** All referrers and source tags are masked from cards and thumbnails—users see only clean categories (`Movies`, `Web Series`, `TV Shows`, `Mini Drama`) and quality badges.
- **Unified Search & Category Dropdown:** Integrated search bar with instant dropdown filtering (`All`, `Mini Drama`, `Movies`, `TV Shows`, `Web Series`) that automatically synchronizes with swipeable mobile category tabs.
- **Cinematic Website Splash Screen:** High-impact opening splash featuring the official ASI OTT brand logo with radial aura pulse and smooth auto-dismiss once per browser session.
- **Branded Video Buffering Animation:** Custom in-player loading screen utilizing the brand logo with breathing glow effect, cyan/red radial aura, and indeterminate stream progress bar.
- **Advanced Video Player Controls:**
  - Integrated in-player settings popover for **Brightness** (40%–200%), **Playback Speed** (0.5x–3.0x), and **Audio Booster** (up to 300%).
  - Screen rotation lock/toggle for mobile landscape and portrait viewing.
  - Aspect ratio switcher (16:9 Widescreen, 4:3 Classic, Theater Fill).
  - Multi-audio language track selection & custom subtitle upload support.
- **Zero-Redirect Direct Cloud Downloads:** Direct download delivery for 480p, 720p, 1080p, and 4K UHD with genuine file sizes and clean filenames without external popups or link shorteners.
- **Dual Production Ready:** Pre-configured with [`render.yaml`](render.yaml) (Render Web Service Blueprint) and [`vercel.json`](vercel.json) (Vercel Edge Functions).

---

## 🚀 Local Installation & Execution

Follow these step-by-step instructions to clone and run ASI OTT locally on your machine.

### Prerequisites

Ensure you have the following installed on your system:
- **[Node.js](https://nodejs.org/)** (Version `18.0.0` or higher required; `20.x` LTS recommended)
- **[Git](https://git-scm.com/)** command-line tools
- A modern web browser (Google Chrome, Mozilla Firefox, Microsoft Edge, or Safari)

---

### Step 1: Clone the Repository

Open your terminal (PowerShell, Bash, or Command Prompt) and run:

```bash
git clone https://github.com/git-masterontheway/ASI-OTT.git
cd ASI-OTT
```

---

### Step 2: Install Dependencies

Install the required production and development dependencies:

```bash
npm install
```

---

### Step 3: Environment Variable Configuration

Create a `.env` configuration file from the provided `.env.example`:

**On Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**On Linux / macOS / Bash:**
```bash
cp .env.example .env
```

Default values in `.env`:
```ini
# Server Port (Default is 3000; auto-increments if port is busy)
PORT=3000

# Environment Mode: 'development' or 'production'
NODE_ENV=development

# Production Canonical Domain
APP_DOMAIN=https://asi-ott.xo.je
```

---

### Step 4: Start the Server

Start the application:

```bash
npm start
```

Or run directly with Node:
```bash
node server.js
```

---

### Step 5: Verify Successful Startup

When the server starts successfully, your terminal will display:

```
===============================================
ASI OTT Server running at: http://0.0.0.0:3000
Environment:               development
Production Domain:         https://asi-ott.xo.je
Health Check:              http://0.0.0.0:3000/health
Home / Search:             http://0.0.0.0:3000
Watch Page:                http://0.0.0.0:3000/watch
===============================================
```

> **Automatic Port Conflict Resolution:**  
> If port `3000` is already in use by another application on your system, the server will automatically detect the conflict and step to `3001` (`http://localhost:3001`). Look at the terminal output to confirm the exact port.

---

### Step 6: Open in Your Browser

Navigate to the local URLs in your web browser:

| Page / Endpoint | URL | Description |
| :--- | :--- | :--- |
| **Homepage & Search** | [`http://localhost:3000/`](http://localhost:3000/) | Full catalog, splash screen, category filter dropdown |
| **Watch & Player** | [`http://localhost:3000/watch`](http://localhost:3000/watch) | Video player, in-player controls, direct downloads |
| **Health Check API** | [`http://localhost:3000/health`](http://localhost:3000/health) | JSON uptime and system health diagnostics |

---

## 🛠️ Troubleshooting Common Issues

| Issue / Error | Cause | Solution |
| :--- | :--- | :--- |
| `EADDRINUSE: address already in use :::3000` | Port 3000 is occupied by another local app. | ASI OTT automatically binds to port `3001`. Alternatively, set `PORT=3005` in your `.env` file. |
| `Permission denied (publickey)` | SSH key not authorized on GitHub. | Add your deploy public key in GitHub under **Repository Settings > Deploy keys** with **Allow write access** checked. |
| Scraper network timeouts | Network latency or rate limiting. | The server includes automated fallbacks, exponential backoff, and proxy failovers. Refreshing the search will re-query active mirrors. |
| Video player stream buffering | Source video host bandwidth throttling. | Switch between **Direct Stream Player** and **Embedded Player** via the top toggle switch on the watch page. |

---

## 📡 API Reference

| Endpoint | Method | Parameters | Description |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | — | Returns server health, uptime, and deployment environment. |
| `/api/content` | `GET` | `?page=1&category=all` | Aggregates titles by page and category (`all`, `mini_drama`, `movies`, `tv_shows`, `web_series`). |
| `/api/search` | `GET` | `?q=query&category=all` | Parallel search across all source catalogs with category filtering. |
| `/api/post` | `GET` | `?id=:id&source=:source` | Resolves item details, media streams, and download links. |
| `/api/stream-download` | `GET` | `?url=...&filename=...` | Proxies high-speed direct downloads with genuine attachment headers. |
| `/api/views/track` | `POST` | `{ id: "slug" }` | Records unique IP view analytics. |

---

## 📁 Repository Structure

```
ASI-OTT/
├── public/                     # Static frontend assets
│   ├── css/
│   │   └── style.css           # Premium OTT theme & responsive styling
│   ├── js/
│   │   ├── app.js              # Catalog browsing, search & category filters
│   │   └── player.js           # Video player, settings, and direct downloads
│   ├── index.html              # Main landing page with unified search
│   ├── watch.html              # Dedicated media streaming & download interface
│   ├── logo.png                # Official brand logo
│   └── favicon.svg             # Modern vector favicon
├── api/
│   └── index.js                # Serverless bridge for Vercel deployment
├── data/                       # Local database storage (views tracking)
├── server.js                   # Core Express backend, scrapers & API endpoints
├── render.yaml                 # Render persistent Web Service configuration
├── vercel.json                 # Vercel serverless edge configuration
├── .env.example                # Example environment configuration
├── package.json                # Project dependencies and startup scripts
├── LICENSE                     # MIT Open Source License
└── README.md                   # Project documentation
```

---

## 📄 License & Credits

- **Developer:** [Amar Kumar](https://github.com/git-masterontheway)
- **License:** Released under the [MIT License](LICENSE). Free for personal, open-source, and commercial use.

---

<div align="center">
  <b>⭐ If you like this project, please give it a star on GitHub! ⭐</b>
</div>
