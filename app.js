/**
 * Google Maps Isochrones API Studio & GeoJSON Generator
 * Author: Antigravity AI
 */

// Application State
const state = {
  apiKey: localStorage.getItem('gmaps_isochrones_apikey') || '',
  mode: 'simulator', // 'simulator' | 'live'
  origin: {
    lat: 40.7580,
    lng: -73.9855,
    name: 'Times Square, New York',
    placeId: ''
  },
  travelMode: 'DRIVE',
  travelDirection: 'FROM',
  durations: [300, 600, 900], // in seconds
  routingPreference: 'TRAFFIC_AWARE',
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  enableSmoothing: true,
  polygonFidelity: 'HIGH',
  displayStyle: 'BANDS', // 'BANDS' | 'STACKED' | 'OUTLINES'
  fetchStrategy: 'PARALLEL', // 'PARALLEL' | 'SEQUENTIAL' | 'MAX_ONLY'
  
  // Multi-Layer Comparison System
  layers: [],
  activeLayerId: null,
  
  // Results
  lastGeoJSON: null,
  lastRawResponse: null,
  
  // Map layers
  map: null,
  originMarker: null,
  isochroneLayers: []
};

// Color palettes for Isochrone contours (from shortest to longest duration)
const CONTOUR_COLORS = [
  { fill: '#10b981', stroke: '#059669' }, // 5 min - Emerald Green
  { fill: '#38bdf8', stroke: '#0284c7' }, // 10 min - Sky Blue
  { fill: '#6366f1', stroke: '#4f46e5' }, // 15 min - Indigo
  { fill: '#f59e0b', stroke: '#d97706' }, // 30 min - Amber
  { fill: '#ec4899', stroke: '#db2777' }, // 45 min - Pink
  { fill: '#f43f5e', stroke: '#e11d48' }, // 60 min - Rose
  { fill: '#a855f7', stroke: '#9333ea' }  // Custom - Purple
];

// Isochrone Duration limits by Travel Mode according to Google Maps Isochrones API Spec
const DURATION_LIMITS = {
  DRIVE: { maxSec: 3600, maxMin: 60, defaultMins: [5, 10, 15], optionsMins: [5, 10, 15, 30, 45, 60] },
  WALK: { maxSec: 7200, maxMin: 120, defaultMins: [15, 30, 60], optionsMins: [5, 10, 15, 30, 45, 60, 75, 90, 105, 120] },
  BICYCLE: { maxSec: 7200, maxMin: 120, defaultMins: [15, 30, 60], optionsMins: [5, 10, 15, 30, 45, 60, 75, 90, 105, 120] }
};

// Speed profiles in km/h for simulator calculations
const SPEED_PROFILES = {
  DRIVE: { avg: 45, max: 80, noise: 0.25 },
  WALK: { avg: 4.8, max: 6.0, noise: 0.1 },
  BICYCLE: { avg: 16, max: 22, noise: 0.15 }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initDOMReferences();
  initMap();
  bindEvents();
  loadSavedState();
});

// DOM References
function initDOMReferences() {
  const apiKeyInput = document.getElementById('api-key');
  if (state.apiKey) {
    apiKeyInput.value = state.apiKey;
  }
}

// Initialize Leaflet Map
function initMap() {
  state.map = L.map('map', {
    zoomControl: false
  }).setView([state.origin.lat, state.origin.lng], 13);

  // Position Zoom Control to top-left
  L.control.zoom({ position: 'topleft' }).addTo(state.map);

  // Dark Map Tiles (CartoDB Dark Matter)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(state.map);

  // Custom Origin Marker Icon
  const originIcon = L.divIcon({
    className: 'custom-origin-icon',
    html: `<div style="
      width: 24px;
      height: 24px;
      background: #38bdf8;
      border: 3px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(56, 189, 248, 0.8);
      cursor: grab;
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  state.originMarker = L.marker([state.origin.lat, state.origin.lng], {
    icon: originIcon,
    draggable: true
  }).addTo(state.map);

  state.originMarker.bindTooltip("Origin Location (Drag to move)", {
    permanent: false,
    direction: "top"
  });

  // Marker Drag End Handler
  state.originMarker.on('dragend', (e) => {
    const latLng = e.target.getLatLng();
    updateOriginCoordinates(latLng.lat, latLng.lng);
  });

  // Map Click Handler
  state.map.on('click', (e) => {
    state.originMarker.setLatLng(e.latlng);
    updateOriginCoordinates(e.latlng.lat, e.latlng.lng);
  });
}

// Update Origin Coordinates
function updateOriginCoordinates(lat, lng) {
  state.origin.lat = parseFloat(lat.toFixed(6));
  state.origin.lng = parseFloat(lng.toFixed(6));
  
  document.getElementById('origin-lat').value = state.origin.lat;
  document.getElementById('origin-lng').value = state.origin.lng;

  showToast(`Origin set to (${state.origin.lat}, ${state.origin.lng})`, 'info');
}

// Bind UI Event Listeners
function bindEvents() {
  // Mobile Sidebar Toggle
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      sidebar.classList.toggle('mobile-open');
    });
  }

  // API Key input
  const apiKeyInput = document.getElementById('api-key');
  apiKeyInput.addEventListener('change', (e) => {
    state.apiKey = e.target.value.trim();
    localStorage.setItem('gmaps_isochrones_apikey', state.apiKey);
  });

  document.getElementById('toggle-api-key').addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // Execution Mode Radio
  document.querySelectorAll('input[name="api-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.mode = e.target.value;
      const badge = document.getElementById('execution-mode-badge');
      const badgeText = document.getElementById('mode-text');
      
      if (state.mode === 'live') {
        badge.classList.add('mode-live');
        badgeText.textContent = 'Live Google API';
      } else {
        badge.classList.remove('mode-live');
        badgeText.textContent = 'Simulator Mode';
      }
      showToast(`Switched to ${state.mode === 'live' ? 'Live API' : 'Simulator'} engine`);
    });
  });

  const fetchStrategySelect = document.getElementById('fetch-strategy');
  if (fetchStrategySelect) {
    fetchStrategySelect.addEventListener('change', (e) => {
      state.fetchStrategy = e.target.value;
    });
  }

  // Lat/Lng manual input
  document.getElementById('origin-lat').addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.origin.lat = val;
      state.originMarker.setLatLng([state.origin.lat, state.origin.lng]);
      state.map.panTo([state.origin.lat, state.origin.lng]);
    }
  });

  document.getElementById('origin-lng').addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      state.origin.lng = val;
      state.originMarker.setLatLng([state.origin.lat, state.origin.lng]);
      state.map.panTo([state.origin.lat, state.origin.lng]);
    }
  });

  // Location Search & GPS Current Location
  document.getElementById('btn-search-location').addEventListener('click', geocodeLocation);
  document.getElementById('location-search').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') geocodeLocation();
  });

  const btnCurrentLoc = document.getElementById('btn-current-location');
  if (btnCurrentLoc) {
    btnCurrentLoc.addEventListener('click', requestCurrentLocation);
  }

  const btnChipGps = document.getElementById('btn-chip-gps');
  if (btnChipGps) {
    btnChipGps.addEventListener('click', requestCurrentLocation);
  }

  // Card Accordion Collapsible Logic
  document.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      const card = header.closest('.card');
      const body = card.querySelector('.card-body');
      const icon = header.querySelector('.card-toggle-icon');
      
      if (body) {
        body.classList.toggle('hidden');
        if (icon) {
          icon.classList.toggle('fa-chevron-down');
          icon.classList.toggle('fa-chevron-right');
        }
      }
    });
  });

  // Preset Chips
  document.querySelectorAll('.btn-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const chip = e.currentTarget;
      if (chip.id === 'btn-chip-gps') return;
      const lat = parseFloat(chip.dataset.lat);
      const lng = parseFloat(e.target.dataset.lng);
      const name = e.target.dataset.name;
      
      document.getElementById('location-search').value = name;
      updateOriginCoordinates(lat, lng);
      state.map.setView([lat, lng], 13);
    });
  });

  // Travel Mode Pills
  document.querySelectorAll('#travel-mode-pills .pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('#travel-mode-pills .pill').forEach(p => p.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      state.travelMode = target.dataset.value;
      renderDurationControls(state.travelMode);
    });
  });

  // Travel Direction
  document.getElementById('travel-direction').addEventListener('change', (e) => {
    state.travelDirection = e.target.value;
  });

  // Duration Checkboxes
  document.getElementById('duration-checkboxes').addEventListener('change', () => {
    updateDurationsFromUI();
  });

  // Custom Duration Adder
  document.getElementById('btn-add-custom-duration').addEventListener('click', () => {
    const input = document.getElementById('custom-duration-min');
    const mins = parseInt(input.value, 10);
    const config = DURATION_LIMITS[state.travelMode] || DURATION_LIMITS.DRIVE;

    if (mins && mins > 0) {
      if (mins > config.maxMin) {
        showToast(`Exceeds ${state.travelMode} limit of ${config.maxMin} mins`, 'error');
        return;
      }
      const seconds = mins * 60;
      const container = document.getElementById('duration-checkboxes');
      
      // Check if already exists
      const existing = container.querySelector(`input[value="${seconds}"]`);
      if (existing) {
        existing.checked = true;
      } else {
        const label = document.createElement('label');
        label.className = 'checkbox-chip';
        label.innerHTML = `<input type="checkbox" value="${seconds}" checked> ${mins} min (${seconds}s)`;
        container.appendChild(label);
      }
      input.value = '';
      updateDurationsFromUI();
    }
  });

  // Routing Preference
  document.getElementById('routing-preference').addEventListener('change', (e) => {
    state.routingPreference = e.target.value;
  });

  // Map overlay stats & legend click handlers to scroll sidebar to #card-layer-manager
  const scrollToLayerManager = () => {
    const layerCard = document.getElementById('card-layer-manager');
    if (!layerCard) return;

    const sidebar = document.querySelector('.sidebar');
    if (sidebar && window.innerWidth <= 768) {
      sidebar.classList.add('mobile-open');
    }

    layerCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    layerCard.classList.remove('card-highlight-pulse');
    void layerCard.offsetWidth; // Trigger reflow to restart animation
    layerCard.classList.add('card-highlight-pulse');

    setTimeout(() => {
      layerCard.classList.remove('card-highlight-pulse');
    }, 1500);
  };

  const mapStats = document.getElementById('map-stats');
  if (mapStats) {
    mapStats.addEventListener('click', scrollToLayerManager);
  }

  const mapLegend = document.getElementById('map-legend');
  if (mapLegend) {
    mapLegend.addEventListener('click', scrollToLayerManager);
  }

  // Avoidances & Smoothing & Fidelity
  document.getElementById('avoid-tolls').addEventListener('change', e => state.avoidTolls = e.target.checked);
  document.getElementById('avoid-highways').addEventListener('change', e => state.avoidHighways = e.target.checked);
  document.getElementById('avoid-ferries').addEventListener('change', e => state.avoidFerries = e.target.checked);
  document.getElementById('enable-smoothing').addEventListener('change', e => state.enableSmoothing = e.target.checked);
  document.getElementById('polygon-fidelity').addEventListener('change', e => state.polygonFidelity = e.target.value);
  
  const displayStyleSelect = document.getElementById('display-style');
  if (displayStyleSelect) {
    displayStyleSelect.addEventListener('change', (e) => {
      state.displayStyle = e.target.value;
      if (state.lastGeoJSON) {
        renderIsochronesOnMap(state.lastGeoJSON);
      }
    });
  }

  // Main Generate Button (Explicit trigger ONLY)
  document.getElementById('btn-generate-main').addEventListener('click', generateIsochrones);

  // Reset Button
  document.getElementById('btn-reset-defaults').addEventListener('click', () => {
    state.travelMode = 'DRIVE';
    state.travelDirection = 'FROM';
    state.durations = [300, 600, 900];
    state.enableSmoothing = true;
    state.polygonFidelity = 'HIGH';
    state.routingPreference = 'TRAFFIC_AWARE';
    
    // Reset UI elements
    document.querySelectorAll('#travel-mode-pills .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.value === 'DRIVE');
    });
    document.getElementById('travel-direction').value = 'FROM';
    document.getElementById('routing-preference').value = 'TRAFFIC_AWARE';
    document.getElementById('enable-smoothing').checked = true;
    document.getElementById('polygon-fidelity').value = 'HIGH';
    
    showToast('Reset configuration to defaults');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      const tabId = e.currentTarget.dataset.tab;
      e.currentTarget.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'tab-map' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 100);
      }
    });
  });

  // Copy & Download Actions
  document.getElementById('btn-copy-geojson').addEventListener('click', () => {
    copyToClipboard(JSON.stringify(state.lastGeoJSON, null, 2), 'GeoJSON copied to clipboard!');
  });
  document.getElementById('btn-download-geojson').addEventListener('click', () => {
    if (!state.lastGeoJSON) {
      showToast('No GeoJSON to download. Please generate isochrones first.', 'error');
      return;
    }
    const maxDurationSec = state.durations && state.durations.length > 0 ? Math.max(...state.durations) : 600;
    const filename = `isochrone_${state.travelMode.toLowerCase()}_${maxDurationSec}s_${state.origin.lat}_${state.origin.lng}.geojson`;
    downloadFile(JSON.stringify(state.lastGeoJSON, null, 2), filename, 'application/geo+json');
  });

  document.getElementById('btn-copy-curl').addEventListener('click', () => {
    const curlText = document.getElementById('code-curl-display').textContent;
    copyToClipboard(curlText, 'cURL command copied to clipboard!');
  });

  document.getElementById('btn-copy-raw').addEventListener('click', () => {
    copyToClipboard(JSON.stringify(state.lastRawResponse, null, 2), 'Raw API JSON copied to clipboard!');
  });

  document.getElementById('btn-download-raw').addEventListener('click', () => {
    if (!state.lastRawResponse) {
      showToast('No Raw Response to download. Please generate isochrones first.', 'error');
      return;
    }
    const maxDurationSec = state.durations && state.durations.length > 0 ? Math.max(...state.durations) : 600;
    const filenameRaw = `isochrone_raw_${state.travelMode.toLowerCase()}_${maxDurationSec}s_${state.origin.lat}_${state.origin.lng}.json`;
    downloadFile(JSON.stringify(state.lastRawResponse, null, 2), filenameRaw, 'application/json');
  });

  // Multi-File Layer Import Actions
  const fileInputHeader = document.getElementById('input-file-import');
  if (fileInputHeader) {
    fileInputHeader.addEventListener('change', (e) => {
      handleImportedFiles(e.target.files);
      e.target.value = '';
    });
  }

  const fileInputLayers = document.getElementById('input-layer-files');
  if (fileInputLayers) {
    fileInputLayers.addEventListener('change', (e) => {
      handleImportedFiles(e.target.files);
      e.target.value = '';
    });
  }

  const btnExportCombined = document.getElementById('btn-export-combined');
  if (btnExportCombined) {
    btnExportCombined.addEventListener('click', exportCombinedGeoJSON);
  }

  const btnClearAll = document.getElementById('btn-clear-all-layers');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', clearAllLayers);
  }
}

// Convert Imported JSON / GeoJSON / Google Raw Output to standard RFC 7946 GeoJSON FeatureCollection
function convertToStandardGeoJSON(parsed, filename) {
  if (!parsed) return null;

  let geojson = null;

  if (parsed.type === "FeatureCollection") {
    geojson = parsed;
    if (geojson.features) {
      geojson.features.forEach((feat, idx) => {
        if (!feat.properties) feat.properties = {};
        const color = CONTOUR_COLORS[idx % CONTOUR_COLORS.length] || CONTOUR_COLORS[0];
        if (!feat.properties.fill_color) feat.properties.fill_color = color.fill;
        if (!feat.properties.stroke_color) feat.properties.stroke_color = color.stroke;
        if (!feat.properties.fill_opacity) feat.properties.fill_opacity = 0.35;
        if (!feat.properties.stroke_weight) feat.properties.stroke_weight = 2;
        if (!feat.properties.duration_formatted) {
          feat.properties.duration_formatted = feat.properties.duration_minutes ? `${feat.properties.duration_minutes} mins` : (feat.properties.duration_seconds ? `${Math.round(feat.properties.duration_seconds / 60)} mins` : `Contour ${idx + 1}`);
        }
      });
    }
  } else if (parsed.type === "Feature") {
    const color = CONTOUR_COLORS[0];
    if (!parsed.properties) parsed.properties = {};
    if (!parsed.properties.fill_color) parsed.properties.fill_color = color.fill;
    if (!parsed.properties.stroke_color) parsed.properties.stroke_color = color.stroke;
    if (!parsed.properties.fill_opacity) parsed.properties.fill_opacity = 0.35;
    if (!parsed.properties.stroke_weight) parsed.properties.stroke_weight = 2;
    if (!parsed.properties.duration_formatted) parsed.properties.duration_formatted = `Imported Contour`;

    geojson = {
      type: "FeatureCollection",
      properties: { generated_by: "Imported File" },
      features: [parsed]
    };
  } else if (parsed.isochrone || parsed.isochrones || parsed.geoJson) {
    geojson = convertGoogleResponseToGeoJSON(parsed);
  } else if (parsed.type === "MultiPolygon" || parsed.type === "Polygon") {
    geojson = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          duration_formatted: "Imported Geometry",
          fill_color: CONTOUR_COLORS[0].fill,
          fill_opacity: 0.35,
          stroke_color: CONTOUR_COLORS[0].stroke,
          stroke_weight: 2
        },
        geometry: parsed
      }]
    };
  }

  return geojson;
}

// Handle Imported GeoJSON or Google API JSON File Data
function handleImportedFileData(parsed, filename) {
  const geojson = convertToStandardGeoJSON(parsed, filename);
  const rawResponse = parsed;

  if (geojson && geojson.features && geojson.features.length > 0) {
    state.lastGeoJSON = geojson;
    state.lastRawResponse = rawResponse;

    renderIsochronesOnMap(geojson);
    updateCodeViews(geojson, rawResponse);

    // Switch to Map tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const mapTabBtn = document.querySelector('.tab-btn[data-tab="tab-map"]');
    if (mapTabBtn) mapTabBtn.classList.add('active');
    document.getElementById('tab-map').classList.add('active');
    if (state.map) setTimeout(() => state.map.invalidateSize(), 100);

    showToast(`Loaded ${geojson.features.length} contour(s) from "${filename}"`, 'success');
  } else {
    showToast(`Could not extract valid GeoJSON geometry from "${filename}"`, 'error');
  }
}

// Load Saved State
function loadSavedState() {
  renderDurationControls(state.travelMode);
}

// Dynamically render duration checkbox options based on selected travel mode limits
function renderDurationControls(travelMode) {
  const config = DURATION_LIMITS[travelMode] || DURATION_LIMITS.DRIVE;
  const container = document.getElementById('duration-checkboxes');
  const maxBadge = document.getElementById('duration-max-limit');
  const customInput = document.getElementById('custom-duration-min');

  if (maxBadge) {
    maxBadge.textContent = `Max limit: ${config.maxMin} mins for ${travelMode}`;
  }
  if (customInput) {
    customInput.max = config.maxMin;
    customInput.placeholder = `Add custom min (1 - ${config.maxMin})`;
  }

  // Preserve currently checked values that fit under max limit
  const currentChecked = (state.durations || []).filter(sec => sec <= config.maxSec);
  container.innerHTML = '';

  config.optionsMins.forEach(mins => {
    const sec = mins * 60;
    const isChecked = currentChecked.length > 0 ? currentChecked.includes(sec) : config.defaultMins.includes(mins);
    const label = document.createElement('label');
    label.className = 'checkbox-chip';
    label.innerHTML = `<input type="checkbox" value="${sec}" ${isChecked ? 'checked' : ''}> ${mins} min (${sec}s)`;
    container.appendChild(label);
  });

  updateDurationsFromUI();
}

// Update durations array from checked checkboxes
function updateDurationsFromUI() {
  const checked = document.querySelectorAll('#duration-checkboxes input:checked');
  const values = Array.from(checked).map(cb => parseInt(cb.value, 10)).sort((a, b) => a - b);
  state.durations = values.length > 0 ? values : [600];
}

// Request User's Current GPS Location via Browser Geolocation API (with IP fallback)
function requestCurrentLocation() {
  if (!navigator.geolocation) {
    fallbackToIPLocation('Geolocation API not supported by browser.');
    return;
  }

  showToast('Requesting GPS location permission...', 'info');

  const onSucc = (position) => {
    const lat = parseFloat(position.coords.latitude.toFixed(6));
    const lng = parseFloat(position.coords.longitude.toFixed(6));
    updateOriginFromGPS(lat, lng, 'Current GPS Location');
  };

  const onErr = (err) => {
    let msg = 'Browser GPS unavailable, retrieving location via IP...';
    if (err.code === err.PERMISSION_DENIED) {
      msg = 'GPS permission denied. Retrieving location via IP...';
    }
    showToast(msg, 'warning');
    fallbackToIPLocation();
  };

  navigator.geolocation.getCurrentPosition(
    onSucc,
    () => {
      // Fallback try without high accuracy
      navigator.geolocation.getCurrentPosition(onSucc, onErr, { enableHighAccuracy: false, timeout: 5000 });
    },
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
  );
}

// IP-based Geolocation Fallback
async function fallbackToIPLocation(reasonMsg = null) {
  if (reasonMsg) showToast(reasonMsg, 'info');
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    if (data && data.latitude && data.longitude) {
      const lat = parseFloat(data.latitude.toFixed(6));
      const lng = parseFloat(data.longitude.toFixed(6));
      const city = data.city || data.region || 'IP Location';
      updateOriginFromGPS(lat, lng, `GPS (${city})`);
      return;
    }
  } catch (e) {
    // Ignore error and fall through
  }
  showToast('Could not acquire location via GPS or IP.', 'error');
}

function updateOriginFromGPS(lat, lng, nameText) {
  state.origin.lat = lat;
  state.origin.lng = lng;
  state.origin.name = nameText;
  state.placeId = '';

  document.getElementById('origin-lat').value = lat;
  document.getElementById('origin-lng').value = lng;
  document.getElementById('place-id').value = '';
  document.getElementById('location-search').value = `${nameText}: (${lat}, ${lng})`;

  if (state.originMarker) {
    state.originMarker.setLatLng([lat, lng]);
  }
  if (state.map) {
    state.map.setView([lat, lng], 14);
  }
  showToast(`Location set to (${lat}, ${lng})`, 'success');
}

// Geocode Location via OpenStreetMap Nominatim
async function geocodeLocation() {
  const query = document.getElementById('location-search').value.trim();
  if (!query) return;

  try {
    showToast(`Searching location "${query}"...`, 'info');
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data && data.length > 0) {
      const first = data[0];
      const lat = parseFloat(first.lat);
      const lng = parseFloat(first.lon);
      
      updateOriginCoordinates(lat, lng);
      state.map.setView([lat, lng], 13);
      showToast(`Found: ${first.display_name.split(',')[0]}`, 'success');
    } else {
      showToast('Location not found. Try a landmark or city name.', 'error');
    }
  } catch (err) {
    showToast('Failed to geocode location', 'error');
  }
}

// Generate Isochrones (Controller)
async function generateIsochrones() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  updateDurationsFromUI();
  showToast('Generating isochrone polygons...', 'info');

  let geojson = null;
  let rawResponse = null;

  if (state.mode === 'live') {
    if (!state.apiKey) {
      showToast('API Key missing for Live Mode! Falling back to Simulator.', 'error');
      geojson = generateSimulatorIsochrones();
      rawResponse = { note: "Simulator fallback output (No API Key specified)" };
    } else {
      try {
        const liveResult = await fetchGoogleIsochronesAPI();
        geojson = liveResult.geojson;
        rawResponse = liveResult.raw;
      } catch (err) {
        showToast(`Live API call error: ${err.message || err}`, 'error');
        geojson = generateSimulatorIsochrones();
        rawResponse = err.rawError || { error: err.message || err, fallback: true };
      }
    }
  } else {
    // Simulator Mode
    geojson = generateSimulatorIsochrones();
    rawResponse = buildMockGoogleAPIResponse(geojson);
  }

  state.lastGeoJSON = geojson;
  state.lastRawResponse = rawResponse;

  const maxDurationSec = state.durations && state.durations.length > 0 ? Math.max(...state.durations) : 600;
  const maxMin = Math.round(maxDurationSec / 60);
  const placeName = state.origin.name ? state.origin.name.split(',')[0] : 'Origin';
  const layerName = `${state.travelMode} ${maxMin}m (${placeName})`;

  addLayer(geojson, layerName, { rawResponse, source: 'generated' });
}

// Live Google Maps Isochrones API Fetcher (Supports Multi-Contour Durations & Strategies)
async function fetchGoogleIsochronesAPI() {
  const endpoint = 'https://isochrones.googleapis.com/v1/isochrones:generate';
  let durationsToFetch = [...state.durations].sort((a, b) => a - b);

  if (state.fetchStrategy === 'MAX_ONLY') {
    durationsToFetch = [durationsToFetch[durationsToFetch.length - 1]];
  }

  const fetchSingleDuration = async (durationSec) => {
    const payload = {
      location: {
        latitude: state.origin.lat,
        longitude: state.origin.lng
      },
      travelMode: state.travelMode,
      travelDirection: state.travelDirection,
      travelDuration: `${durationSec}s`,
      enableSmoothing: state.enableSmoothing,
      polygonFidelity: state.polygonFidelity
    };

    // routingPreference is ONLY valid for DRIVE
    if (state.travelMode === 'DRIVE') {
      payload.routingPreference = state.routingPreference;
    }

    if (state.placeId) {
      payload.location = {
        place: state.placeId.startsWith('places/') ? state.placeId : `places/${state.placeId}`
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': state.apiKey,
        'X-Goog-FieldMask': '*'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    let rawData;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      rawData = { errorText: responseText };
    }

    if (!res.ok) {
      const errorMsg = rawData.error?.message || `HTTP ${res.status}: ${responseText}`;
      throw { message: errorMsg, rawError: rawData, status: res.status };
    }

    return { durationSec, rawData };
  };

  let results = [];
  if (state.fetchStrategy === 'SEQUENTIAL') {
    for (const dSec of durationsToFetch) {
      const item = await fetchSingleDuration(dSec);
      results.push(item);
    }
  } else {
    // PARALLEL or MAX_ONLY
    results = await Promise.all(durationsToFetch.map(dSec => fetchSingleDuration(dSec)));
  }

  // Combine raw responses and convert to GeoJSON FeatureCollection
  const combinedRaw = { isochrones: results.map(r => r.rawData.isochrone || r.rawData) };
  
  // Build multi-contour GeoJSON
  const features = [];
  // Sort results from largest duration to smallest for stacking order
  const sortedResults = [...results].sort((a, b) => b.durationSec - a.durationSec);

  sortedResults.forEach((item) => {
    const durationSec = item.durationSec;
    const rawData = item.rawData;
    const origIndex = state.durations.indexOf(durationSec);
    const color = CONTOUR_COLORS[origIndex >= 0 ? (origIndex % CONTOUR_COLORS.length) : 0];

    let isoObj = rawData.isochrone || (Array.isArray(rawData.isochrones) ? rawData.isochrones[0] : rawData);
    let geometry = null;

    if (isoObj && isoObj.geoJson) {
      geometry = isoObj.geoJson;
    } else if (isoObj && isoObj.isochroneZone && isoObj.isochroneZone.polygon) {
      const ring = (isoObj.isochroneZone.polygon.coordinates || []).map(c => [c.longitude, c.latitude]);
      geometry = { type: "Polygon", coordinates: [ring] };
    } else if (isoObj && isoObj.polygon && isoObj.polygon.coordinates) {
      const ring = isoObj.polygon.coordinates.map(c => [c.longitude, c.latitude]);
      geometry = { type: "Polygon", coordinates: [ring] };
    }

    if (geometry) {
      let areaSqKm = 0;
      if (typeof turf !== 'undefined') {
        try {
          areaSqKm = parseFloat((turf.area({ type: "Feature", geometry, properties: {} }) / 1000000).toFixed(2));
        } catch (e) { areaSqKm = 0; }
      }

      features.push({
        type: "Feature",
        properties: {
          duration_seconds: durationSec,
          duration_minutes: Math.round(durationSec / 60),
          duration_formatted: `${Math.round(durationSec / 60)} mins`,
          max_duration_seconds: Math.max(...state.durations),
          max_duration_formatted: `${Math.round(Math.max(...state.durations) / 60)} mins`,
          travel_mode: state.travelMode,
          travel_direction: state.travelDirection,
          routing_preference: state.routingPreference,
          area_sq_km: areaSqKm,
          fill_color: color.fill,
          fill_opacity: 0.35,
          stroke_color: color.stroke,
          stroke_weight: 2,
          origin_latitude: state.origin.lat,
          origin_longitude: state.origin.lng
        },
        geometry
      });
    }
  });

  const maxDurationSec = state.durations && state.durations.length > 0 ? Math.max(...state.durations) : 600;

  const geojson = {
    type: "FeatureCollection",
    properties: {
      generated_by: "Google Maps Isochrones API Studio",
      travel_mode: state.travelMode,
      max_duration_seconds: maxDurationSec,
      max_duration_formatted: `${Math.round(maxDurationSec / 60)} mins`,
      origin_latitude: state.origin.lat,
      origin_longitude: state.origin.lng,
      origin: [state.origin.lng, state.origin.lat],
      total_contours: features.length,
      created_at: new Date().toISOString()
    },
    features
  };

  return { geojson, raw: combinedRaw };
}

// Convert Google API Response object into RFC 7946 GeoJSON FeatureCollection
function convertGoogleResponseToGeoJSON(rawData) {
  const features = [];

  // Normalize list of isochrone objects from Google response
  let rawIsoList = [];
  if (rawData) {
    if (Array.isArray(rawData.isochrones)) {
      rawIsoList = rawData.isochrones;
    } else if (rawData.isochrone) {
      rawIsoList = [rawData.isochrone];
    } else if (rawData.geoJson) {
      rawIsoList = [{ geoJson: rawData.geoJson }];
    }
  }

  rawIsoList.forEach((iso, idx) => {
    const color = CONTOUR_COLORS[idx % CONTOUR_COLORS.length] || CONTOUR_COLORS[0];
    const durationSec = parseInt(iso.travelDuration || `${state.durations[state.durations.length - 1]}`, 10) || (state.durations[idx] || 900);
    
    let geometry = null;

    // Case 1: Google returns native GeoJSON object in `geoJson`
    if (iso.geoJson) {
      geometry = iso.geoJson;
    }
    // Case 2: Google returns `isochroneZone.polygon`
    else if (iso.isochroneZone && iso.isochroneZone.polygon) {
      const googleCoords = iso.isochroneZone.polygon.coordinates || [];
      const ring = googleCoords.map(coord => [coord.longitude, coord.latitude]);
      geometry = {
        type: "Polygon",
        coordinates: [ring]
      };
    }
    // Case 3: Google returns `polygon.coordinates` directly
    else if (iso.polygon && iso.polygon.coordinates) {
      const googleCoords = iso.polygon.coordinates;
      const ring = googleCoords.map(coord => [coord.longitude, coord.latitude]);
      geometry = {
        type: "Polygon",
        coordinates: [ring]
      };
    }

    if (geometry) {
      // Calculate area in sq km if turf is available
      let areaSqKm = 0;
      if (typeof turf !== 'undefined') {
        try {
          const featureObj = { type: "Feature", geometry, properties: {} };
          areaSqKm = parseFloat((turf.area(featureObj) / 1000000).toFixed(2));
        } catch (e) {
          areaSqKm = 0;
        }
      }

      features.push({
        type: "Feature",
        properties: {
          duration_seconds: durationSec,
          duration_minutes: Math.round(durationSec / 60),
          duration_formatted: `${Math.round(durationSec / 60)} mins`,
          travel_mode: state.travelMode,
          travel_direction: state.travelDirection,
          routing_preference: state.routingPreference,
          area_sq_km: areaSqKm,
          fill_color: color.fill,
          fill_opacity: Math.max(0.15, 0.40 - (idx * 0.05)),
          stroke_color: color.stroke,
          stroke_weight: 2,
          origin_lat: state.origin.lat,
          origin_lng: state.origin.lng
        },
        geometry
      });
    }
  });

  return {
    type: "FeatureCollection",
    properties: {
      generated_by: "Google Maps Isochrones API Studio",
      origin: [state.origin.lng, state.origin.lat],
      travel_mode: state.travelMode,
      created_at: new Date().toISOString()
    },
    features
  };
}

// High-Fidelity Offline Isochrone Simulator Engine
function generateSimulatorIsochrones() {
  const features = [];
  const profile = SPEED_PROFILES[state.travelMode] || SPEED_PROFILES.DRIVE;

  // Generate contours from largest duration to smallest for correct polygon stacking order
  const sortedDurations = [...state.durations].sort((a, b) => b - a);

  sortedDurations.forEach((durationSec, i) => {
    const origIndex = state.durations.indexOf(durationSec);
    const color = CONTOUR_COLORS[origIndex % CONTOUR_COLORS.length] || CONTOUR_COLORS[0];
    const durationMin = durationSec / 60;
    
    // Average radius reachable in km
    const baseRadiusKm = (profile.avg * (durationMin / 60));
    
    // Generate realistic road network polygon star points
    const points = [];
    const numVertices = state.polygonFidelity === 'HIGH' ? 48 : (state.polygonFidelity === 'MEDIUM' ? 32 : 16);
    
    for (let k = 0; k < numVertices; k++) {
      const angle = (k / numVertices) * (2 * Math.PI);
      
      // Road network anisotropy: faster along cardinal axes (highways / grid streets)
      const cardinalFactor = 1.0 + 0.35 * Math.abs(Math.sin(angle * 2));
      
      // Pseudo-random terrain/traffic noise seed using lat/lng and angle
      const pseudoNoise = Math.sin(state.origin.lat * 10 + angle * 4) * Math.cos(state.origin.lng * 10 + angle * 3);
      const noiseFactor = 1.0 + (pseudoNoise * profile.noise);
      
      const radius = baseRadiusKm * cardinalFactor * noiseFactor;
      
      // Convert km offset to lat/lng degrees
      const latOffset = (radius / 111.32) * Math.cos(angle);
      const lngOffset = (radius / (111.32 * Math.cos(state.origin.lat * Math.PI / 180))) * Math.sin(angle);
      
      points.push([
        parseFloat((state.origin.lng + lngOffset).toFixed(6)),
        parseFloat((state.origin.lat + latOffset).toFixed(6))
      ]);
    }
    
    // Close polygon ring
    points.push(points[0]);

    // Optional smoothing filter
    let finalRing = points;
    if (state.enableSmoothing && typeof turf !== 'undefined') {
      try {
        const line = turf.lineString(points);
        const smoothed = turf.bezierSpline(line, { resolution: 10000, sharpness: 0.85 });
        finalRing = smoothed.geometry.coordinates;
      } catch (e) {
        finalRing = points;
      }
    }

    // Calculate exact polygon area using Turf.js
    let areaSqKm = 0;
    if (typeof turf !== 'undefined') {
      try {
        const poly = turf.polygon([finalRing]);
        areaSqKm = parseFloat((turf.area(poly) / 1000000).toFixed(2));
      } catch (e) {
        areaSqKm = parseFloat((Math.PI * Math.pow(baseRadiusKm, 2)).toFixed(2));
      }
    }

    features.push({
      type: "Feature",
      properties: {
        duration_seconds: durationSec,
        duration_minutes: durationMin,
        duration_formatted: `${durationMin} mins`,
        max_duration_seconds: Math.max(...state.durations),
        max_duration_formatted: `${Math.round(Math.max(...state.durations) / 60)} mins`,
        travel_mode: state.travelMode,
        travel_direction: state.travelDirection,
        routing_preference: state.routingPreference,
        area_sq_km: areaSqKm,
        fill_color: color.fill,
        fill_opacity: 0.35 + (origIndex * 0.05),
        stroke_color: color.stroke,
        stroke_weight: 2,
        origin_latitude: state.origin.lat,
        origin_longitude: state.origin.lng
      },
      geometry: {
        type: "Polygon",
        coordinates: [finalRing]
      }
    });
  });

  const maxDurationSec = state.durations && state.durations.length > 0 ? Math.max(...state.durations) : 600;

  return {
    type: "FeatureCollection",
    properties: {
      generated_by: "Google Maps Isochrones API Studio",
      engine: "High-Fidelity Road Network Simulator",
      travel_mode: state.travelMode,
      max_duration_seconds: maxDurationSec,
      max_duration_formatted: `${Math.round(maxDurationSec / 60)} mins`,
      origin_latitude: state.origin.lat,
      origin_longitude: state.origin.lng,
      origin: [state.origin.lng, state.origin.lat],
      total_contours: features.length,
      created_at: new Date().toISOString()
    },
    features
  };
}

// Build Mock Google Isochrones API JSON Response
function buildMockGoogleAPIResponse(geojson) {
  const isochrones = geojson.features.map(f => {
    const coords = f.geometry.coordinates[0].map(pt => ({
      latitude: pt[1],
      longitude: pt[0]
    }));

    return {
      travelDuration: `${f.properties.duration_seconds}s`,
      isochroneZone: {
        polygon: {
          coordinates: coords
        }
      }
    };
  });

  return {
    isochrones
  };
}

// Multi-Layer Manager Core Functions
function addLayer(geojson, name, options = {}) {
  if (!geojson || !geojson.features || geojson.features.length === 0) return null;

  const layerId = 'layer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const paletteIndex = state.layers.length % CONTOUR_COLORS.length;
  const defaultColor = options.color || CONTOUR_COLORS[paletteIndex].fill;

  const layerObj = {
    id: layerId,
    name: name || `Isochrone Layer ${state.layers.length + 1}`,
    visible: true,
    color: defaultColor,
    opacity: options.opacity || 0.35,
    geojson,
    rawResponse: options.rawResponse || null,
    source: options.source || 'generated',
    createdAt: new Date().toISOString(),
    leafletGroup: L.featureGroup()
  };

  state.layers.push(layerObj);
  state.activeLayerId = layerId;
  state.lastGeoJSON = geojson;
  if (options.rawResponse) state.lastRawResponse = options.rawResponse;

  renderAllLayers();
  renderLayerManagerUI();
  updateCodeViews(geojson, state.lastRawResponse);
  
  return layerObj;
}

function removeLayer(layerId) {
  const index = state.layers.findIndex(l => l.id === layerId);
  if (index >= 0) {
    const layerObj = state.layers[index];
    if (layerObj.leafletGroup && state.map) {
      state.map.removeLayer(layerObj.leafletGroup);
    }
    state.layers.splice(index, 1);
    
    if (state.activeLayerId === layerId) {
      state.activeLayerId = state.layers.length > 0 ? state.layers[state.layers.length - 1].id : null;
      if (state.activeLayerId) {
        const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
        if (activeLayer) {
          state.lastGeoJSON = activeLayer.geojson;
          updateCodeViews(activeLayer.geojson, activeLayer.rawResponse);
        }
      } else {
        state.lastGeoJSON = null;
        document.getElementById('code-geojson-display').textContent = '// No layer loaded...';
      }
    }

    renderAllLayers();
    renderLayerManagerUI();
    showToast(`Removed layer "${layerObj.name}"`);
  }
}

function toggleLayerVisibility(layerId, visibleState) {
  const layerObj = state.layers.find(l => l.id === layerId);
  if (layerObj) {
    layerObj.visible = typeof visibleState === 'boolean' ? visibleState : !layerObj.visible;
    renderAllLayers();
    renderLayerManagerUI();
  }
}

function updateLayer(layerId, updates = {}) {
  const layerObj = state.layers.find(l => l.id === layerId);
  if (layerObj) {
    if (updates.name !== undefined) layerObj.name = updates.name;
    if (updates.color !== undefined) layerObj.color = updates.color;
    if (updates.opacity !== undefined) layerObj.opacity = updates.opacity;

    renderAllLayers();
    renderLayerManagerUI();
  }
}

function clearAllLayers() {
  state.layers.forEach(layerObj => {
    if (layerObj.leafletGroup && state.map) {
      state.map.removeLayer(layerObj.leafletGroup);
    }
  });
  state.layers = [];
  state.activeLayerId = null;
  state.lastGeoJSON = null;
  state.lastRawResponse = null;

  renderAllLayers();
  renderLayerManagerUI();
  document.getElementById('map-stats').classList.add('hidden');
  document.getElementById('code-geojson-display').textContent = '// No active layer...';
  showToast('Cleared all layers');
}

function zoomToLayer(layerId) {
  const layerObj = state.layers.find(l => l.id === layerId);
  if (layerObj && layerObj.leafletGroup && state.map) {
    const bounds = layerObj.leafletGroup.getBounds();
    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }
}

function renderAllLayers() {
  if (!state.map) return;

  // Clear all current leafletGroups from map
  state.layers.forEach(l => {
    if (l.leafletGroup) state.map.removeLayer(l.leafletGroup);
    l.leafletGroup = L.featureGroup();
  });

  const legendItemsContainer = document.getElementById('legend-items');
  if (legendItemsContainer) legendItemsContainer.innerHTML = '';

  let totalContours = 0;
  let maxAreaSum = 0;

  const visibleLayers = state.layers.filter(l => l.visible);

  visibleLayers.forEach(layerObj => {
    const geojson = layerObj.geojson;
    const styleMode = state.displayStyle || 'BANDS';
    const sortedSmallToLarge = [...geojson.features].sort((a, b) => (a.properties.duration_seconds || 0) - (b.properties.duration_seconds || 0));

    sortedSmallToLarge.forEach((feature, idx) => {
      totalContours++;
      const props = feature.properties;
      if (props.area_sq_km > maxAreaSum) maxAreaSum = props.area_sq_km;

      let displayGeom = feature.geometry;

      if (styleMode === 'BANDS' && idx > 0 && typeof turf !== 'undefined') {
        try {
          const outerPoly = feature;
          const innerPoly = sortedSmallToLarge[idx - 1];
          const diff = turf.difference(outerPoly, innerPoly);
          if (diff && diff.geometry) displayGeom = diff.geometry;
        } catch (e) {}
      }

      let fillOp = layerObj.opacity !== undefined ? layerObj.opacity : 0.35;
      let strokeW = 2.5;

      if (styleMode === 'OUTLINES') {
        fillOp = 0.06;
        strokeW = 3.5;
      }

      const strokeColor = props.stroke_color || layerObj.color;
      const fillColor = props.fill_color || layerObj.color;

      const subLayer = L.geoJSON({
        type: "Feature",
        geometry: displayGeom,
        properties: props
      }, {
        style: {
          fillColor: fillColor,
          fillOpacity: fillOp,
          color: strokeColor,
          weight: strokeW
        }
      });

      subLayer.bindPopup(`
        <div style="font-family: var(--font-sans); padding: 4px;">
          <h4 style="margin: 0 0 4px 0; color: var(--accent-primary); font-size: 0.85rem;">
            📂 ${layerObj.name}
          </h4>
          <h3 style="margin: 0 0 6px 0; color: ${strokeColor}; font-size: 1rem;">
            ⏱️ ${props.duration_formatted || 'Isochrone Zone'}
          </h3>
          <p style="margin: 2px 0; font-size: 0.82rem;"><strong>Mode:</strong> ${props.travel_mode || state.travelMode}</p>
          <p style="margin: 2px 0; font-size: 0.82rem;"><strong>Area:</strong> ${props.area_sq_km || 0} km²</p>
        </div>
      `);

      layerObj.leafletGroup.addLayer(subLayer);
    });

    layerObj.leafletGroup.addTo(state.map);

    // Legend item for layer
    if (legendItemsContainer) {
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-item';
      legendItem.innerHTML = `
        <div class="legend-item-left">
          <span class="color-swatch" style="background-color: ${layerObj.color}; border-color: #ffffff;"></span>
          <span style="font-weight: 600;">${layerObj.name}</span>
        </div>
        <span class="text-muted" style="font-size: 0.72rem;">${layerObj.geojson.features.length} zones</span>
      `;
      legendItemsContainer.appendChild(legendItem);
    }
  });

  // Update Stats Overlay
  if (visibleLayers.length > 0) {
    document.getElementById('stat-contours').textContent = totalContours;
    document.getElementById('stat-max-area').textContent = `${maxAreaSum} km²`;
    document.getElementById('stat-mode').textContent = `${visibleLayers.length} Layer(s)`;
    document.getElementById('map-stats').classList.remove('hidden');
  } else {
    document.getElementById('map-stats').classList.add('hidden');
  }
}

function renderLayerManagerUI() {
  const container = document.getElementById('layer-list');
  const countBadge = document.getElementById('layer-count-badge');
  if (!container) return;

  if (countBadge) countBadge.textContent = state.layers.length;

  if (state.layers.length === 0) {
    container.innerHTML = `
      <div class="empty-layers-msg text-muted" style="text-align: center; padding: 12px; font-size: 0.8rem;">
        No layers loaded. Click "Generate" or "Add Files" to compare Isochrones.
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  state.layers.forEach(layerObj => {
    const item = document.createElement('div');
    item.className = `layer-item ${state.activeLayerId === layerObj.id ? 'active' : ''}`;
    item.dataset.layerId = layerObj.id;

    const contourCount = layerObj.geojson.features ? layerObj.geojson.features.length : 0;
    const firstProps = (layerObj.geojson.features && layerObj.geojson.features[0]) ? layerObj.geojson.features[0].properties : {};
    const modeText = firstProps.travel_mode || layerObj.source;

    item.innerHTML = `
      <div class="layer-item-header">
        <input type="checkbox" class="layer-visibility-toggle" ${layerObj.visible ? 'checked' : ''} title="Toggle visibility">
        <input type="color" class="layer-color-picker" value="${layerObj.color}" title="Change color scheme">
        <span class="layer-name" contenteditable="true" title="Click to rename">${layerObj.name}</span>
        <div class="layer-actions">
          <button type="button" class="btn-icon-sm btn-zoom" title="Fit map to layer"><i class="fa-solid fa-expand"></i></button>
          <button type="button" class="btn-icon-sm text-rose btn-delete" title="Delete layer"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="layer-item-details">
        <span>${contourCount} contour(s) • ${modeText}</span>
        <div class="layer-opacity-row">
          <span>Op:</span>
          <input type="range" class="layer-opacity-slider" min="0.05" max="1" step="0.05" value="${layerObj.opacity}">
        </div>
      </div>
    `;

    const checkbox = item.querySelector('.layer-visibility-toggle');
    checkbox.addEventListener('change', (e) => toggleLayerVisibility(layerObj.id, e.target.checked));

    const colorPicker = item.querySelector('.layer-color-picker');
    colorPicker.addEventListener('change', (e) => updateLayer(layerObj.id, { color: e.target.value }));

    const nameSpan = item.querySelector('.layer-name');
    nameSpan.addEventListener('blur', (e) => updateLayer(layerObj.id, { name: e.target.innerText.trim() }));
    nameSpan.addEventListener('keypress', (e) => { if (e.key === 'Enter') e.target.blur(); });

    const opacitySlider = item.querySelector('.layer-opacity-slider');
    opacitySlider.addEventListener('input', (e) => updateLayer(layerObj.id, { opacity: parseFloat(e.target.value) }));

    const zoomBtn = item.querySelector('.btn-zoom');
    zoomBtn.addEventListener('click', () => zoomToLayer(layerObj.id));

    const deleteBtn = item.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => removeLayer(layerObj.id));

    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.closest('.layer-actions') || e.target.classList.contains('layer-name')) return;
      state.activeLayerId = layerObj.id;
      state.lastGeoJSON = layerObj.geojson;
      renderLayerManagerUI();
      updateCodeViews(layerObj.geojson, layerObj.rawResponse);
    });

    container.appendChild(item);
  });
}

function handleImportedFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const fileArray = Array.from(fileList);
  showToast(`Importing ${fileArray.length} file(s)...`, 'info');

  fileArray.forEach(file => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        let geojson = null;

        if (typeof convertToStandardGeoJSON === 'function') {
          geojson = convertToStandardGeoJSON(parsed, file.name);
        } else if (parsed.type === 'FeatureCollection') {
          geojson = parsed;
        } else if (parsed.type === 'Feature') {
          geojson = { type: 'FeatureCollection', features: [parsed] };
        }

        if (geojson && geojson.features && geojson.features.length > 0) {
          const cleanName = file.name.replace(/\.[^/.]+$/, "");
          if (typeof addLayer === 'function') {
            addLayer(geojson, cleanName, { source: 'imported' });
          } else if (typeof handleImportedFileData === 'function') {
            handleImportedFileData(parsed, file.name);
          }
          showToast(`Imported "${cleanName}" (${geojson.features.length} zones)`, 'success');
        } else {
          showToast(`No valid geometry in "${file.name}"`, 'error');
        }
      } catch (err) {
        showToast(`Error reading "${file.name}": ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  });
}

function exportCombinedGeoJSON() {
  const visibleLayers = state.layers.filter(l => l.visible);
  if (visibleLayers.length === 0) {
    showToast('No active layers to export.', 'error');
    return;
  }

  const combinedFeatures = [];
  visibleLayers.forEach(l => {
    if (l.geojson && l.geojson.features) {
      l.geojson.features.forEach(f => {
        combinedFeatures.push({
          ...f,
          properties: {
            ...f.properties,
            layer_name: l.name,
            layer_color: l.color
          }
        });
      });
    }
  });

  const combinedGeoJSON = {
    type: "FeatureCollection",
    properties: {
      generated_by: "Google Maps Isochrones API Studio - Multi-Layer Comparison",
      exported_layers_count: visibleLayers.length,
      created_at: new Date().toISOString()
    },
    features: combinedFeatures
  };

  const filename = `isochrones_multi_layer_comparison_${Date.now()}.geojson`;
  downloadFile(JSON.stringify(combinedGeoJSON, null, 2), filename, 'application/geo+json');
}

// Render GeoJSON Isochrones on Leaflet Map
// Render GeoJSON Isochrones on Leaflet Map
function renderIsochronesOnMap(geojson) {
  renderAllLayers();
}

// Update Code Viewers (GeoJSON, cURL, Raw Response)
function updateCodeViews(geojson, rawResponse) {
  // GeoJSON View
  document.getElementById('code-geojson-display').textContent = JSON.stringify(geojson, null, 2);

  // Raw Response View
  document.getElementById('code-raw-display').textContent = JSON.stringify(rawResponse, null, 2);

  // cURL View
  const maxDuration = state.durations[state.durations.length - 1];
  const apiKeyHeader = state.apiKey ? state.apiKey : 'YOUR_GOOGLE_MAPS_API_KEY';
  
  const payloadObj = {
    location: {
      latitude: state.origin.lat,
      longitude: state.origin.lng
    },
    travelMode: state.travelMode,
    travelDirection: state.travelDirection,
    travelDuration: `${maxDuration}s`,
    enableSmoothing: state.enableSmoothing,
    polygonFidelity: state.polygonFidelity
  };

  if (state.travelMode === 'DRIVE') {
    payloadObj.routingPreference = state.routingPreference;
  }

  const curlCommand = `curl -X POST "https://isochrones.googleapis.com/v1/isochrones:generate" \\
  -H "Content-Type: application/json" \\
  -H "X-Goog-Api-Key: ${apiKeyHeader}" \\
  -H "X-Goog-FieldMask: *" \\
  -d '${JSON.stringify(payloadObj, null, 4)}'`;

  document.getElementById('code-curl-display').textContent = curlCommand;
}

// Utilities
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'error' ? 'fa-triangle-exclamation' : (type === 'success' ? 'fa-circle-check' : 'fa-circle-info');
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg, 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

function downloadFile(content, filename, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${filename}`, 'success');
}
