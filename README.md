# 🗺️ Google Maps Isochrones API Studio

A modern, interactive GUI and GeoJSON generator for the new **Google Maps Isochrones API**. Interactively configure travel-time reachability contours, visualize crisp non-overlapping polygon bands on Leaflet, and export standard RFC 7946 `.geojson` files.

Live Demo / Hosted Page: [https://Some1sm.github.io/Google-Maps-Isochrones/](https://Some1sm.github.io/Google-Maps-Isochrones/)

---

## ✨ Features

- 🚗 **Travel Modes**: Supports `DRIVE` (driving), `WALK` (walking), and `BICYCLE` (cycling) with dynamic duration limits (up to 60 mins for drive, 120 mins for walk/bike).
- ⏱️ **Multi-Contour Thresholds**: Configure multiple travel time intervals (e.g. 5m, 10m, 15m, 30m) simultaneously.
- 🎨 **Non-Overlapping Donut Rings**: Spatial cut-outs (`turf.difference`) prevent color bleeding and muddy overlapping filled polygons.
- 🗺️ **Leaflet Visualizer**: Interactive map with draggable origin marker, Nominatim search, quick location presets, legend overlay, and real-time stats.
- 📥 **GeoJSON Export & Import**: Download standard `.geojson` files or import existing JSON / GeoJSON files.
- 💻 **cURL & REST Code Views**: Auto-generates exact cURL commands and payload objects matching Google Maps REST API specs.
- ⚡ **Offline Simulator Engine**: Includes built-in simulated isochrone engine for quick offline demonstration without requiring an active Google API Key.

---

## 🚀 Quick Start

### 1. Run Locally
Because this is a pure single-page application built with HTML, CSS, and Vanilla JavaScript, no build process is required!

Simply open `index.html` in your browser, or start a local HTTP server:

```bash
python -m http.server 8080
```
Then visit `http://localhost:8080` in your browser.

### 2. GitHub Pages Deployment
1. Go to **Settings** > **Pages** in this GitHub repository.
2. Set **Source** to `Deploy from a branch`.
3. Choose `main` / `(root)` and click **Save**.

---

## 🛠️ Built With

- **HTML5 & Vanilla JavaScript (ES6+)**
- **Vanilla CSS3** (Dark Glassmorphic UI Design)
- **Leaflet.js** (Open-source interactive map engine)
- **Turf.js** (Spatial analysis & polygon difference calculations)
- **FontAwesome 6** (Modern icon suite)
