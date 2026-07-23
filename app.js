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
  departureTimeOption: 'NOW',
  customDatetime: '',
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  enableSmoothing: true,
  polygonFidelity: 'HIGH',
  displayStyle: 'BANDS', // 'BANDS' | 'STACKED' | 'OUTLINES'
  fetchStrategy: 'PARALLEL', // 'PARALLEL' | 'SEQUENTIAL' | 'MAX_ONLY'
  
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

  // Time Condition
  document.getElementById('departure-time-option').addEventListener('change', (e) => {
    state.departureTimeOption = e.target.value;
    const customContainer = document.getElementById('custom-time-container');
    if (state.departureTimeOption === 'CUSTOM') {
      customContainer.classList.remove('hidden');
    } else {
      customContainer.classList.add('hidden');
    }
  });

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

  // File Import Action
  const fileInput = document.getElementById('input-file-import');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          handleImportedFileData(parsed, file.name);
        } catch (err) {
          showToast(`Failed to parse JSON file: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }
}

// Handle Imported GeoJSON or Google API JSON File Data
function handleImportedFileData(parsed, filename) {
  let geojson = null;
  let rawResponse = parsed;

  if (parsed.type === "FeatureCollection") {
    geojson = parsed;
    geojson.features.forEach((feat, idx) => {
      if (!feat.properties) feat.properties = {};
      const color = CONTOUR_COLORS[idx % CONTOUR_COLORS.length] || CONTOUR_COLORS[0];
      if (!feat.properties.fill_color) feat.properties.fill_color = color.fill;
      if (!feat.properties.stroke_color) feat.properties.stroke_color = color.stroke;
      if (!feat.properties.fill_opacity) feat.properties.fill_opacity = 0.35;
      if (!feat.properties.stroke_weight) feat.properties.stroke_weight = 2;
      if (!feat.properties.duration_formatted) feat.properties.duration_formatted = `Contour ${idx + 1}`;
    });
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

  // Render Map & Display
  renderIsochronesOnMap(geojson);
  updateCodeViews(geojson, rawResponse);
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
    }
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

// Render GeoJSON Isochrones on Leaflet Map (Supports Donut Ring Bands, Stacked, and Outlines)
function renderIsochronesOnMap(geojson) {
  // Clear existing layers
  state.isochroneLayers.forEach(layer => state.map.removeLayer(layer));
  state.isochroneLayers = [];

  const legendItemsContainer = document.getElementById('legend-items');
  legendItemsContainer.innerHTML = '';

  if (!geojson || !geojson.features || geojson.features.length === 0) {
    document.getElementById('map-stats').classList.add('hidden');
    return;
  }

  let maxArea = 0;
  const styleMode = state.displayStyle || 'BANDS';

  // Sort features from SMALLEST duration to LARGEST duration
  const sortedSmallToLarge = [...geojson.features].sort((a, b) => (a.properties.duration_seconds || 0) - (b.properties.duration_seconds || 0));

  // Compute display features based on style mode
  const displayItems = sortedSmallToLarge.map((feature, idx) => {
    const props = feature.properties;
    if (props.area_sq_km > maxArea) maxArea = props.area_sq_km;

    let displayGeom = feature.geometry;

    // In BANDS mode, subtract inner polygon from outer polygon so colors do NOT overlap/blend!
    if (styleMode === 'BANDS' && idx > 0 && typeof turf !== 'undefined') {
      try {
        const outerPoly = feature;
        const innerPoly = sortedSmallToLarge[idx - 1];
        const diff = turf.difference(outerPoly, innerPoly);
        if (diff && diff.geometry) {
          displayGeom = diff.geometry;
        }
      } catch (e) {
        displayGeom = feature.geometry;
      }
    }

    return {
      originalFeature: feature,
      displayGeom,
      props
    };
  });

  // For STACKED style, render largest to smallest so smaller sits on top.
  const renderList = styleMode === 'STACKED' ? [...displayItems].reverse() : displayItems;

  renderList.forEach((item) => {
    const props = item.props;

    let fillOp = 0.45;
    let strokeW = 2.5;

    if (styleMode === 'OUTLINES') {
      fillOp = 0.06;
      strokeW = 3.5;
    } else if (styleMode === 'STACKED') {
      fillOp = 0.35;
      strokeW = 2;
    }

    const layer = L.geoJSON({
      type: "Feature",
      geometry: item.displayGeom,
      properties: props
    }, {
      style: {
        fillColor: props.fill_color,
        fillOpacity: fillOp,
        color: props.stroke_color,
        weight: strokeW
      }
    }).addTo(state.map);

    // Popup card
    layer.bindPopup(`
      <div style="font-family: var(--font-sans); padding: 4px;">
        <h3 style="margin: 0 0 6px 0; color: ${props.stroke_color}; font-size: 1rem;">
          ⏱️ ${props.duration_formatted} Zone
        </h3>
        <p style="margin: 2px 0; font-size: 0.82rem;"><strong>Mode:</strong> ${props.travel_mode}</p>
        <p style="margin: 2px 0; font-size: 0.82rem;"><strong>Direction:</strong> ${props.travel_direction}</p>
        <p style="margin: 2px 0; font-size: 0.82rem;"><strong>Area:</strong> ${props.area_sq_km} km²</p>
      </div>
    `);

    state.isochroneLayers.push(layer);
  });

  // Render Legend Items (Ordered smallest to largest duration)
  sortedSmallToLarge.forEach((feature) => {
    const props = feature.properties;
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <div class="legend-item-left">
        <span class="color-swatch" style="background-color: ${props.fill_color}; border-color: ${props.stroke_color};"></span>
        <span>${props.duration_formatted}</span>
      </div>
      <span class="text-muted" style="font-size: 0.72rem;">${props.area_sq_km} km²</span>
    `;
    legendItemsContainer.appendChild(legendItem);
  });

  // Update Stats Card
  document.getElementById('stat-contours').textContent = geojson.features.length;
  document.getElementById('stat-max-area').textContent = `${maxArea} km²`;
  document.getElementById('stat-mode').textContent = state.travelMode;
  document.getElementById('map-stats').classList.remove('hidden');

  // Fit map bounds to outer contour
  if (state.isochroneLayers.length > 0) {
    const group = L.featureGroup(state.isochroneLayers);
    state.map.fitBounds(group.getBounds(), { padding: [40, 40] });
  }
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
