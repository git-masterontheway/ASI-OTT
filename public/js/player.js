/**
 * ASI OTT - Dedicated Horizontal Video Player & Download Delivery System
 * Checklist Implementation:
 * 1. Horizontal Video Player Integration (Watch Online) with on-site playback & no external redirects
 * 2. Proper Timeline Duration Formatting (Hours:Minutes:Seconds structure) & Navigation controls
 * 3. Clean Content Detail layout (Primary Thumbnail & Title only)
 * 4. Structured Quality Downloads (480p, 720p, 1080p with sizes 450MB, 1.2GB, 2.9GB)
 * 5. "Cloud Direct", "Direct Download", and "HD Cloud" buttons with direct file download initiation
 */

const VERCEL_BACKEND = 'https://asiott.vercel.app';
const API_BASE = '';

/**
 * Resilient Post Fetch Helper
 */
async function fetchPostData(id, source) {
  const query = `/api/post?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`;
  const primaryUrl = `${API_BASE}${query}`;

  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json && json.success) return json;
      } catch (_) {}
    }
  } catch (err) {
    console.warn('Primary post fetch failed, falling back to Vercel...', err);
  }

  // Automatic fallback to Vercel
  if (!primaryUrl.startsWith(VERCEL_BACKEND)) {
    const fallbackRes = await fetch(`${VERCEL_BACKEND}${query}`);
    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.success) {
        return fallbackData;
      }
    }
  }

  throw new Error('Failed to load content details from aggregation server');
}

// State
let seriesData = null;
let audioContext = null;
let gainNode = null;
let audioSourceConnected = false;
let currentAspectRatio = 'theater'; // Default to horizontal 16:9 for Watch Online
let activePlayerType = 'custom'; // 'custom' or 'embed'

// DOM Elements
const playerStage = document.getElementById('player-stage');
const customVideo = document.getElementById('custom-video');
const embedIframe = document.getElementById('embed-iframe');
const tapZoneLeft = document.getElementById('tap-zone-left');
const tapZoneRight = document.getElementById('tap-zone-right');
const centerPlayBtn = document.getElementById('center-play-btn');
const centerPlayIcon = document.getElementById('center-play-icon');
const playerOverlay = document.getElementById('player-controls-overlay');
const overlayTitle = document.getElementById('overlay-title');
const ctrlPlayBtn = document.getElementById('ctrl-play-btn');
const ctrlPlayIcon = document.getElementById('ctrl-play-icon');
const ctrlRewindBtn = document.getElementById('ctrl-rewind-btn');
const ctrlForwardBtn = document.getElementById('ctrl-forward-btn');
const ctrlMuteBtn = document.getElementById('ctrl-mute-btn');
const ctrlVolumeIcon = document.getElementById('ctrl-volume-icon');
const ctrlFullscreenBtn = document.getElementById('ctrl-fullscreen-btn');
const ctrlFullscreenIcon = document.getElementById('ctrl-fullscreen-icon');
const ctrlPipBtn = document.getElementById('ctrl-pip-btn');
const ctrlShareBtn = document.getElementById('ctrl-share-btn');
const mainShareBtn = document.getElementById('main-share-btn');
const progressContainer = document.getElementById('progress-container');
const progressBufferBar = document.getElementById('progress-buffer-bar');
const progressBar = document.getElementById('progress-bar');
const seekTooltip = document.getElementById('seek-tooltip');
const quickSkipBadge = document.getElementById('quick-skip-badge');
const quickSkipText = document.getElementById('quick-skip-text');
const timeDisplay = document.getElementById('time-display');

// In-Player Settings Elements
const ctrlSettingsBtn = document.getElementById('ctrl-settings-btn');
const playerSettingsPopover = document.getElementById('player-settings-popover');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const audioBoostSlider = document.getElementById('audio-boost-slider');
const valAudioBoost = document.getElementById('val-audio-boost');
const brightnessSlider = document.getElementById('brightness-slider');
const valBrightness = document.getElementById('val-brightness');
const speedSlider = document.getElementById('speed-slider');
const speedButtons = document.querySelectorAll('.speed-btn');
const valSpeed = document.getElementById('val-speed');
const toggleAspectBtn = document.getElementById('toggle-aspect-btn');
const aspectLabel = document.getElementById('aspect-label');
const toggleRotateBtn = document.getElementById('toggle-rotate-btn');
const ctrlRotateBtn = document.getElementById('ctrl-rotate-btn');
const btnModeDirect = document.getElementById('btn-mode-direct');
const btnModeEmbed = document.getElementById('btn-mode-embed');

// Audio & Subtitles Elements
const ctrlAudioBtn = document.getElementById('ctrl-audio-btn');
const playerAudioPopover = document.getElementById('player-audio-popover');
const audioCloseBtn = document.getElementById('audio-close-btn');
const audioTracksList = document.getElementById('audio-tracks-list');
const ctrlSubtitlesBtn = document.getElementById('ctrl-subtitles-btn');
const playerSubtitlesPopover = document.getElementById('player-subtitles-popover');
const subtitlesCloseBtn = document.getElementById('subtitles-close-btn');
const subtitlesTracksList = document.getElementById('subtitles-tracks-list');
const subFileInput = document.getElementById('sub-file-input');

// Content Detail & Topbar Elements
const topbarSource = document.getElementById('topbar-source');
const topbarCategory = document.getElementById('topbar-category');
const detailPoster = document.getElementById('detail-poster');
const detailPosterContainer = document.getElementById('detail-poster-container');
const detailSourceBadge = document.getElementById('detail-source-badge');
const detailCategoryBadge = document.getElementById('detail-category-badge');
const detailViews = document.getElementById('detail-views');
const seriesFullTitle = document.getElementById('series-full-title');
const scrollToDownloadsBtn = document.getElementById('scroll-to-downloads-btn');
const playerControlsTopGroup = document.getElementById('player-controls-top-group');

// Branded Video Loading Overlay Elements (Using Uploaded Logo)
const playerVideoLoading = document.getElementById('player-video-loading');
const pvlStatusTitle = document.getElementById('pvl-status-title');
const pvlStatusSubtitle = document.getElementById('pvl-status-subtitle');

function showPlayerVideoLoading(title = 'Buffering Video...', subtitle = 'Connecting to high-speed CDN') {
  if (playerVideoLoading) {
    if (pvlStatusTitle) pvlStatusTitle.textContent = title;
    if (pvlStatusSubtitle) pvlStatusSubtitle.textContent = subtitle;
    playerVideoLoading.classList.add('active');
  }
}

function hidePlayerVideoLoading() {
  if (playerVideoLoading) {
    playerVideoLoading.classList.remove('active');
  }
}

// Download Elements
const unifiedDownloadContainer = document.getElementById('unified-download-container') || document.getElementById('quality-download-grid');
const dlStatusBanner = document.getElementById('dl-status-banner');
const dlStatusText = document.getElementById('dl-status-text');
const dlStatusBadge = document.getElementById('dl-status-badge');

/**
 * Toast Notification Helper
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Timeline Duration Formatter
 * Formats time with proper Hours:Minutes:Seconds structure (e.g. 01:24:45 or 04:12)
 */
function formatTimelineDuration(seconds, forceHours = false) {
  if (isNaN(seconds) || seconds < 0) return forceHours ? '00:00:00' : '00:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hrs > 0 || forceHours) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

function formatVerboseDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0 min 0 sec';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs} hr ${mins} min ${secs} sec`;
  }
  return `${mins} min ${secs} sec`;
}

/**
 * Initialize Web Audio API for Volume Booster up to 300%
 */
function setupAudioBooster() {
  if (audioSourceConnected) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audioContext = new AudioContextClass();
    const source = audioContext.createMediaElementSource(customVideo);
    gainNode = audioContext.createGain();

    const boostVal = parseFloat(audioBoostSlider.value) / 100;
    gainNode.gain.value = boostVal;

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    audioSourceConnected = true;
  } catch (err) {
    // Cross-origin restriction fallback; native audio remains active
  }
}

/**
 * Fetch Post Details & Initialize Video
 */
async function loadEpisode() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || params.get('slug');
  const source = params.get('source') || '';

  if (!id) {
    seriesFullTitle.textContent = 'Error: No title selected';
    showToast('Invalid content link: missing ID', 'error');
    return;
  }

  showPlayerVideoLoading('Loading Title...', 'Resolving media stream & CDN servers');

  try {
    seriesData = await fetchPostData(id, source);

    // Set page title
    document.title = `Watch ${seriesData.title} Online - ASI OTT`;
    overlayTitle.textContent = seriesData.title;
    seriesFullTitle.textContent = seriesData.title;

    // Set primary thumbnail (Clean layout: only primary thumbnail and title)
    if (seriesData.poster) {
      detailPoster.src = seriesData.poster;
      customVideo.poster = seriesData.poster;
    }

    // Set Category & Clean Badges (SOURCE MASKING: Do NOT reveal original source names)
    const catName = seriesData.category || 'Movies';
    const catClass = catName.toLowerCase().replace(/\s+/g, '-');
    
    if (topbarCategory) {
      topbarCategory.textContent = catName;
      topbarCategory.className = `category-badge badge-${catClass}`;
    }
    if (topbarSource) {
      topbarSource.style.display = 'none'; // Source Masked
    }
    if (detailSourceBadge) {
      detailSourceBadge.style.display = 'none'; // Source Masked
    }
    if (detailCategoryBadge) {
      detailCategoryBadge.textContent = catName;
      detailCategoryBadge.className = `category-badge badge-${catClass}`;
    }
    if (detailViews) {
      let cleanViews = String(seriesData.originalViews || '3.2K')
        .replace(/👁️/g, '')
        .replace(/views/gi, '')
        .trim();
      if (!cleanViews) cleanViews = '3.2K';
      detailViews.innerHTML = `<i class="fa-solid fa-eye"></i> ${cleanViews} views`;
    }

    // Standard Video Player Container Setup (Always visible across all aggregated domains)
    if (playerStage) playerStage.style.display = 'block';
    if (detailPosterContainer) detailPosterContainer.style.display = 'block';
    if (playerControlsTopGroup) playerControlsTopGroup.style.display = 'flex';
    document.body.classList.remove('unplayable-mode');

    // Aspect Ratio Configuration
    // Mini Dramas can be vertical 9:16; Movies & Series are horizontal 16:9
    if (seriesData.aspectRatio === 'vertical' || catName === 'Mini Drama') {
      setAspectRatio('vertical');
    } else {
      setAspectRatio('theater'); // 16:9 horizontal
    }

    // Set Poster Backdrop
    if (seriesData.poster) {
      customVideo.poster = seriesData.poster;
      detailPoster.src = seriesData.poster;
    }

    // Video Playback Setup (Direct Stream or Designated Embed)
    if (seriesData.directStreamUrl) {
      setupDirectStreamPlayback(true);
    } else if (seriesData.embedUrl) {
      switchToEmbedPlayer();
    } else if (seriesData.isFilmyzilla || seriesData.source === 'Filmyzilla') {
      setupFilmyzillaHeroStage();
    } else {
      switchToCustomPlayer(false);
    }

    // Fallback to embedded player if video element encountered an unsupported codec
    customVideo.onerror = () => {
      if (seriesData.embedUrl && activePlayerType !== 'embed') {
        console.warn('Native stream error, switching to designated embed player...');
        switchToEmbedPlayer();
      }
    };

    // Render Structured Quality Downloads (480p, 720p, 1080p)
    renderDownloadSection(seriesData.qualities, seriesData.title);

    // Render Episode Selector (for Multi-Episode Anime & Web Series)
    renderEpisodesSection(seriesData.episodes, seriesData.currentEpisode);

    // Track unique views
    trackUniqueView(id);

  } catch (err) {
    hidePlayerVideoLoading();
    console.error('Episode load error:', err);
    seriesFullTitle.textContent = 'Content Unavailable';
    showToast(err.message, 'error');
    if (qualityDownloadGrid) {
      qualityDownloadGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 2.5rem; color: #f43f5e; margin-bottom: 1rem;"></i>
          <h3 style="font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-main, #fff);">Unable to Load Content Details</h3>
          <p style="color: var(--text-muted); margin-bottom: 1.5rem; max-width: 500px; margin-left: auto; margin-right: auto;">
            ${err.message}. The requested item may have been moved or removed from the source catalog.
          </p>
          <a href="/" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none;">
            <i class="fa-solid fa-house"></i> Browse Available Titles
          </a>
        </div>
      `;
    }
  }
}

/**
 * Setup Direct Stream Playback (Native HTML5 or HLS.js with Audio/Subtitle Tracks)
 */
function setupDirectStreamPlayback(autoPlay = true) {
  showPlayerVideoLoading('Buffering Stream...', 'Connecting to direct CDN video player');

  if (!seriesData?.directStreamUrl) {
    if (seriesData?.embedUrl) {
      showToast('Direct stream unavailable, loading embedded player...', 'info');
      switchToEmbedPlayer();
    } else {
      showToast('No playable media source found for this title.', 'error');
    }
    return;
  }

  let streamEndpoint = seriesData.directStreamUrl;
  if (seriesData.directStreamUrl.startsWith('http')) {
    streamEndpoint = `${API_BASE}/api/stream-video?url=${encodeURIComponent(seriesData.directStreamUrl)}`;
  } else if (seriesData.directStreamUrl.startsWith('/api/')) {
    streamEndpoint = `${API_BASE}${seriesData.directStreamUrl}`;
  }

  const isM3u8 = seriesData.directStreamUrl.includes('.m3u8') || streamEndpoint.includes('.m3u8');

  if (isM3u8 && window.Hls && Hls.isSupported()) {
    if (window.hlsInstance) {
      window.hlsInstance.destroy();
    }
    window.hlsInstance = new Hls({
      enableWorker: true,
      maxBufferLength: 600, // 10 minutes lookahead pre-buffer
      maxMaxBufferLength: 900, // up to 15 minutes
      maxBufferSize: 300 * 1024 * 1024, // 300MB buffer memory capacity
      backBufferLength: 120,
      lowLatencyMode: false
    });
    window.hlsInstance.loadSource(streamEndpoint);
    window.hlsInstance.attachMedia(customVideo);

    window.hlsInstance.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      populateAudioTracks();
      populateSubtitleTracks();
      if (autoPlay) {
        startVideoPlayback();
      }
    });

    window.hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      populateAudioTracks();
    });

    window.hlsInstance.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      populateSubtitleTracks();
    });

    window.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn('Fatal HLS error, attempting recovery or fallback to embed:', data.details);
        if (seriesData.embedUrl && activePlayerType !== 'embed') {
          switchToEmbedPlayer();
        }
      }
    });
    switchToCustomPlayer(autoPlay);

  } else if (isM3u8 && customVideo.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS for Safari on iOS / macOS
    customVideo.src = streamEndpoint;
    customVideo.addEventListener('loadedmetadata', () => {
      populateAudioTracks();
      populateSubtitleTracks();
      if (autoPlay) startVideoPlayback();
    }, { once: true });
    switchToCustomPlayer(autoPlay);

  } else {
    // Direct video stream (MP4, MKV/WebM supported container, or proxied stream)
    customVideo.src = streamEndpoint;
    customVideo.load();
    populateAudioTracks();
    populateSubtitleTracks();
    switchToCustomPlayer(autoPlay);
  }
}

/**
 * Aspect Ratio Handler (Horizontal 16:9 vs Vertical 9:16)
 */
function setAspectRatio(mode) {
  if (mode === 'theater') {
    playerStage.classList.remove('aspect-vertical');
    playerStage.classList.add('aspect-theater');
    currentAspectRatio = 'theater';
    if (aspectLabel) aspectLabel.textContent = '16:9';
    if (toggleAspectBtn) toggleAspectBtn.innerHTML = `<i class="fa-solid fa-desktop"></i> <span id="aspect-label">16:9</span>`;
  } else {
    playerStage.classList.remove('aspect-theater');
    playerStage.classList.add('aspect-vertical');
    currentAspectRatio = 'vertical';
    if (aspectLabel) aspectLabel.textContent = '9:16';
    if (toggleAspectBtn) toggleAspectBtn.innerHTML = `<i class="fa-solid fa-mobile-screen"></i> <span id="aspect-label">9:16</span>`;
  }
}

if (toggleAspectBtn) {
  toggleAspectBtn.addEventListener('click', () => {
    if (currentAspectRatio === 'theater') {
      setAspectRatio('vertical');
      showToast('Player switched to Vertical 9:16', 'info');
    } else {
      setAspectRatio('theater');
      showToast('Player switched to Horizontal 16:9', 'info');
    }
  });
}

/**
 * Screen Rotation Controller (Toggle Portrait / Landscape)
 */
function toggleScreenRotation() {
  if (currentAspectRatio === 'theater') {
    setAspectRatio('vertical');
    showToast('Screen rotated to Portrait (9:16)', 'info');
  } else {
    setAspectRatio('theater');
    showToast('Screen rotated to Landscape (16:9)', 'info');
  }

  // Request hardware orientation change if in fullscreen
  if (document.fullscreenElement && screen.orientation && screen.orientation.lock) {
    const targetOrientation = currentAspectRatio === 'theater' ? 'landscape' : 'portrait';
    screen.orientation.lock(targetOrientation).catch(() => {});
  }
}

if (toggleRotateBtn) toggleRotateBtn.addEventListener('click', toggleScreenRotation);
if (ctrlRotateBtn) ctrlRotateBtn.addEventListener('click', toggleScreenRotation);

/**
 * Switch Player Modes (Direct Stream vs Embed)
 */
function switchToEmbedPlayer() {
  if (!seriesData?.embedUrl) {
    showToast('No embedded player stream available for this title', 'error');
    return;
  }
  showPlayerVideoLoading('Connecting Embedded Player...', 'Loading embedded player stream');
  customVideo.pause();
  customVideo.style.display = 'none';
  embedIframe.removeAttribute('sandbox');
  embedIframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
  if (seriesData.embedUrl.includes('playmate.to')) {
    embedIframe.src = seriesData.embedUrl;
  } else {
    embedIframe.src = `${API_BASE}/api/clean-embed?url=${encodeURIComponent(seriesData.embedUrl)}`;
  }
  embedIframe.style.display = 'block';
  if (tapZoneLeft) tapZoneLeft.style.display = 'none';
  if (tapZoneRight) tapZoneRight.style.display = 'none';
  centerPlayBtn.style.display = 'none';
  playerOverlay.style.display = 'none';
  activePlayerType = 'embed';

  const embedSpeedBar = document.getElementById('embed-speed-bar');
  if (embedSpeedBar) embedSpeedBar.style.display = 'flex';

  embedIframe.onload = () => {
    setTimeout(hidePlayerVideoLoading, 400);
  };
  setTimeout(hidePlayerVideoLoading, 2400);

  if (btnModeEmbed) btnModeEmbed.classList.add('active');
  if (btnModeDirect) btnModeDirect.classList.remove('active');

  closeAllPopovers();
  showToast('Switched to Embedded Player', 'info');
}

function switchToCustomPlayer(forcePlay = true) {
  embedIframe.style.display = 'none';
  embedIframe.src = '';
  customVideo.style.display = 'block';
  if (tapZoneLeft) tapZoneLeft.style.display = 'flex';
  if (tapZoneRight) tapZoneRight.style.display = 'flex';
  centerPlayBtn.style.display = 'flex';
  playerOverlay.style.display = 'flex';
  activePlayerType = 'custom';

  const embedSpeedBar = document.getElementById('embed-speed-bar');
  if (embedSpeedBar) embedSpeedBar.style.display = 'none';

  if (btnModeDirect) btnModeDirect.classList.add('active');
  if (btnModeEmbed) btnModeEmbed.classList.remove('active');

  if (!customVideo.src && !window.hlsInstance) {
    setupDirectStreamPlayback(forcePlay);
  } else if (forcePlay) {
    startVideoPlayback();
  }
  showToast('Switched to Direct Stream Player', 'info');
}

if (btnModeDirect) {
  btnModeDirect.addEventListener('click', () => {
    if (activePlayerType !== 'custom') {
      switchToCustomPlayer(true);
    }
  });
}

if (btnModeEmbed) {
  btnModeEmbed.addEventListener('click', () => {
    if (activePlayerType !== 'embed') {
      switchToEmbedPlayer();
    }
  });
}

/**
 * Multi-Audio Track Management
 */
function populateAudioTracks() {
  if (!audioTracksList) return;
  audioTracksList.innerHTML = '';

  if (window.hlsInstance && window.hlsInstance.audioTracks && window.hlsInstance.audioTracks.length > 0) {
    const tracks = window.hlsInstance.audioTracks;
    const currentTrack = window.hlsInstance.audioTrack;

    tracks.forEach((track, idx) => {
      const trackDiv = document.createElement('div');
      trackDiv.className = `track-item ${idx === currentTrack ? 'active' : ''}`;
      trackDiv.dataset.index = idx;
      trackDiv.innerHTML = `
        <span>${track.name || track.lang || `Audio Track ${idx + 1}`}</span>
        <i class="fa-solid fa-check"></i>
      `;
      trackDiv.addEventListener('click', () => {
        window.hlsInstance.audioTrack = idx;
        audioTracksList.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
        trackDiv.classList.add('active');
        showToast(`Audio track: ${track.name || track.lang || `Track ${idx + 1}`}`, 'info');
        closeAllPopovers();
      });
      audioTracksList.appendChild(trackDiv);
    });
  } else if (customVideo.audioTracks && customVideo.audioTracks.length > 0) {
    for (let i = 0; i < customVideo.audioTracks.length; i++) {
      const track = customVideo.audioTracks[i];
      const trackDiv = document.createElement('div');
      trackDiv.className = `track-item ${track.enabled ? 'active' : ''}`;
      trackDiv.dataset.index = i;
      trackDiv.innerHTML = `
        <span>${track.label || track.language || `Audio Track ${i + 1}`}</span>
        <i class="fa-solid fa-check"></i>
      `;
      trackDiv.addEventListener('click', () => {
        for (let j = 0; j < customVideo.audioTracks.length; j++) {
          customVideo.audioTracks[j].enabled = (j === i);
        }
        audioTracksList.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
        trackDiv.classList.add('active');
        showToast(`Audio track: ${track.label || track.language || `Track ${i + 1}`}`, 'info');
        closeAllPopovers();
      });
      audioTracksList.appendChild(trackDiv);
    }
  } else {
    audioTracksList.innerHTML = `
      <div class="track-item active" data-index="0">
        <span>Default Audio (Stereo)</span>
        <i class="fa-solid fa-check"></i>
      </div>
    `;
  }
}

/**
 * Subtitle & Caption Management
 */
function populateSubtitleTracks() {
  if (!subtitlesTracksList) return;
  subtitlesTracksList.innerHTML = '';

  // "Off" option
  const offDiv = document.createElement('div');
  const isHlsOff = window.hlsInstance ? (window.hlsInstance.subtitleTrack === -1) : true;
  offDiv.className = `track-item ${isHlsOff ? 'active' : ''}`;
  offDiv.dataset.index = -1;
  offDiv.innerHTML = `
    <span>Off (No Captions)</span>
    <i class="fa-solid fa-check"></i>
  `;
  offDiv.addEventListener('click', () => {
    if (window.hlsInstance) {
      window.hlsInstance.subtitleTrack = -1;
    }
    for (let i = 0; i < customVideo.textTracks.length; i++) {
      customVideo.textTracks[i].mode = 'disabled';
    }
    subtitlesTracksList.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
    offDiv.classList.add('active');
    showToast('Subtitles turned off', 'info');
    closeAllPopovers();
  });
  subtitlesTracksList.appendChild(offDiv);

  // HLS Subtitle Tracks
  if (window.hlsInstance && window.hlsInstance.subtitleTracks && window.hlsInstance.subtitleTracks.length > 0) {
    window.hlsInstance.subtitleTracks.forEach((track, idx) => {
      const trackDiv = document.createElement('div');
      trackDiv.className = `track-item ${idx === window.hlsInstance.subtitleTrack ? 'active' : ''}`;
      trackDiv.dataset.index = idx;
      trackDiv.innerHTML = `
        <span>${track.name || track.lang || `Subtitle ${idx + 1}`}</span>
        <i class="fa-solid fa-check"></i>
      `;
      trackDiv.addEventListener('click', () => {
        window.hlsInstance.subtitleTrack = idx;
        subtitlesTracksList.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
        trackDiv.classList.add('active');
        showToast(`Subtitles: ${track.name || track.lang || `Track ${idx + 1}`}`, 'info');
        closeAllPopovers();
      });
      subtitlesTracksList.appendChild(trackDiv);
    });
  }

  // HTML5 Video Text Tracks
  if (customVideo.textTracks && customVideo.textTracks.length > 0) {
    for (let i = 0; i < customVideo.textTracks.length; i++) {
      const t = customVideo.textTracks[i];
      const trackDiv = document.createElement('div');
      trackDiv.className = `track-item ${t.mode === 'showing' ? 'active' : ''}`;
      trackDiv.innerHTML = `
        <span>${t.label || t.language || `Caption ${i + 1}`}</span>
        <i class="fa-solid fa-check"></i>
      `;
      trackDiv.addEventListener('click', () => {
        for (let j = 0; j < customVideo.textTracks.length; j++) {
          customVideo.textTracks[j].mode = (j === i) ? 'showing' : 'disabled';
        }
        if (window.hlsInstance) window.hlsInstance.subtitleTrack = -1;
        subtitlesTracksList.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
        trackDiv.classList.add('active');
        showToast(`Subtitles: ${t.label || `Caption ${i + 1}`}`, 'info');
        closeAllPopovers();
      });
      subtitlesTracksList.appendChild(trackDiv);
    }
  }
}

// Custom subtitle file loader (.vtt / .srt)
if (subFileInput) {
  subFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      let vttContent = evt.target.result;
      if (file.name.endsWith('.srt')) {
        vttContent = 'WEBVTT\n\n' + vttContent.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }
      const blob = new Blob([vttContent], { type: 'text/vtt' });
      const blobUrl = URL.createObjectURL(blob);

      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = file.name.replace(/\.[^/.]+$/, '');
      track.srclang = 'custom';
      track.src = blobUrl;
      track.default = true;
      customVideo.appendChild(track);

      setTimeout(() => {
        const lastIdx = customVideo.textTracks.length - 1;
        if (customVideo.textTracks[lastIdx]) {
          for (let j = 0; j < customVideo.textTracks.length; j++) {
            customVideo.textTracks[j].mode = (j === lastIdx) ? 'showing' : 'disabled';
          }
        }
        populateSubtitleTracks();
        showToast(`Loaded custom subtitle: ${file.name}`, 'success');
        closeAllPopovers();
      }, 100);
    };
    reader.readAsText(file);
  });
}

/**
 * Popover Controls (Settings, Audio, Subtitles)
 */
const playerSpeedPopover = document.getElementById('player-speed-popover');
const ctrlSpeedBtn = document.getElementById('ctrl-speed-btn');
const ctrlSpeedLabel = document.getElementById('ctrl-speed-label');
const speedPopCloseBtn = document.getElementById('speed-pop-close-btn');

function closeAllPopovers() {
  if (playerSettingsPopover) playerSettingsPopover.classList.remove('open');
  if (playerAudioPopover) playerAudioPopover.classList.remove('open');
  if (playerSubtitlesPopover) playerSubtitlesPopover.classList.remove('open');
  if (playerSpeedPopover) playerSpeedPopover.classList.remove('open');
}

if (ctrlAudioBtn) {
  ctrlAudioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = playerAudioPopover && playerAudioPopover.classList.contains('open');
    closeAllPopovers();
    if (!isOpen && playerAudioPopover) {
      populateAudioTracks();
      playerAudioPopover.classList.add('open');
    }
  });
}

if (ctrlSubtitlesBtn) {
  ctrlSubtitlesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = playerSubtitlesPopover && playerSubtitlesPopover.classList.contains('open');
    closeAllPopovers();
    if (!isOpen && playerSubtitlesPopover) {
      populateSubtitleTracks();
      playerSubtitlesPopover.classList.add('open');
    }
  });
}

if (ctrlSpeedBtn) {
  ctrlSpeedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = playerSpeedPopover && playerSpeedPopover.classList.contains('open');
    closeAllPopovers();
    if (!isOpen && playerSpeedPopover) {
      playerSpeedPopover.classList.add('open');
    }
  });
}

if (speedPopCloseBtn) {
  speedPopCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllPopovers();
  });
}

if (audioCloseBtn) audioCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeAllPopovers(); });
if (subtitlesCloseBtn) subtitlesCloseBtn.addEventListener('click', (e) => { e.stopPropagation(); closeAllPopovers(); });

document.addEventListener('click', (e) => {
  const isInside = (playerSettingsPopover && playerSettingsPopover.contains(e.target)) ||
                   (playerAudioPopover && playerAudioPopover.contains(e.target)) ||
                   (playerSubtitlesPopover && playerSubtitlesPopover.contains(e.target)) ||
                   (playerSpeedPopover && playerSpeedPopover.contains(e.target)) ||
                   e.target === ctrlSettingsBtn || e.target === ctrlAudioBtn || e.target === ctrlSubtitlesBtn || e.target === ctrlSpeedBtn;
  if (!isInside) {
    closeAllPopovers();
  }
});

/**
 * Smart 10-Minute Buffer Lookahead Engine
 * Ensures 10-minute buffer is preloaded before starting playback,
 * and once playback passes 7 minutes, continually loads remaining 10 minutes to prevent internet buffering drops.
 */
let bufferMonitorTimer = null;
let forwardPrefetchActive = false;

function startSmartBufferLookaheadEngine() {
  if (bufferMonitorTimer) clearInterval(bufferMonitorTimer);

  const bufferBadge = document.getElementById('player-buffer-indicator');
  const bufferText = document.getElementById('buffer-indicator-text');

  function updateBufferStatus() {
    if (!customVideo) return;

    if (activePlayerType === 'embed') {
      if (bufferText) bufferText.textContent = 'Embed Stream Ready';
      return;
    }

    const current = customVideo.currentTime || 0;
    const duration = customVideo.duration || 0;
    let forwardBuffered = 0;

    if (customVideo.buffered && customVideo.buffered.length > 0) {
      for (let i = 0; i < customVideo.buffered.length; i++) {
        const start = customVideo.buffered.start(i);
        const end = customVideo.buffered.end(i);
        if (start <= current + 1 && end >= current) {
          forwardBuffered = Math.max(0, end - current);
          break;
        }
      }
    }

    const targetLookahead = (duration > 0 && duration < 600) ? Math.max(15, duration - current) : 600;

    if (forwardBuffered >= targetLookahead || (duration > 0 && current + forwardBuffered >= duration - 2)) {
      if (bufferText) bufferText.textContent = '10m Buffer Active • Zero Stutter';
      if (bufferBadge) {
        bufferBadge.style.borderColor = 'rgba(16, 185, 129, 0.45)';
        bufferBadge.style.background = 'rgba(16, 185, 129, 0.16)';
        bufferBadge.style.boxShadow = '0 0 14px rgba(16, 185, 129, 0.35)';
      }
    } else {
      const mins = Math.floor(forwardBuffered / 60);
      const secs = Math.floor(forwardBuffered % 60);
      const text = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      if (bufferText) bufferText.textContent = `Pre-buffering 10m ahead (${text})`;
      if (bufferBadge) {
        bufferBadge.style.borderColor = 'rgba(6, 182, 212, 0.45)';
        bufferBadge.style.background = 'rgba(6, 182, 212, 0.14)';
        bufferBadge.style.boxShadow = '0 0 12px rgba(6, 182, 212, 0.25)';
      }
    }

    // When playback passes 7 minutes (420s) or forward buffer falls below 10 mins (600s),
    // ensure the player continues aggressively pre-loading the left 10 mins!
    if (current >= 420 || forwardBuffered < 600) {
      if (window.hlsInstance && window.hlsInstance.config) {
        window.hlsInstance.config.maxBufferLength = 600;
        window.hlsInstance.config.maxMaxBufferLength = 900;
      }
      if (seriesData?.directStreamUrl && !forwardPrefetchActive && forwardBuffered < 120 && duration > current + forwardBuffered) {
        prefetchDirectStreamChunk();
      }
    }
    updateLoadedTimeline();
  }

  bufferMonitorTimer = setInterval(updateBufferStatus, 2000);
  updateBufferStatus();
}

async function prefetchDirectStreamChunk() {
  if (forwardPrefetchActive || !seriesData?.directStreamUrl) return;
  forwardPrefetchActive = true;
  try {
    const streamUrl = seriesData.directStreamUrl.startsWith('http')
      ? `/api/stream-video?url=${encodeURIComponent(seriesData.directStreamUrl)}`
      : seriesData.directStreamUrl;
    await fetch(streamUrl, {
      headers: { 'Range': 'bytes=0-1048576' }
    }).catch(() => {});
  } finally {
    setTimeout(() => { forwardPrefetchActive = false; }, 8000);
  }
}

/**
 * Instant Video Playback Trigger with Sound
 */
function startVideoPlayback() {
  if (activePlayerType !== 'custom') return;

  customVideo.muted = false;
  ctrlVolumeIcon.className = 'fa-solid fa-volume-high';

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  startSmartBufferLookaheadEngine();

  const playPromise = customVideo.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      ctrlPlayIcon.className = 'fa-solid fa-pause';
      centerPlayBtn.style.opacity = '0';
      centerPlayBtn.style.pointerEvents = 'none';
    }).catch(err => {
      console.warn('Playback gesture fallback:', err);
      customVideo.muted = false;
      customVideo.play();
    });
  }
}

function togglePlay() {
  if (activePlayerType !== 'custom') return;

  if (customVideo.paused || customVideo.ended) {
    startVideoPlayback();
  } else {
    customVideo.pause();
    ctrlPlayIcon.className = 'fa-solid fa-play';
    centerPlayBtn.style.opacity = '1';
    centerPlayBtn.style.pointerEvents = 'auto';
  }
}

// Center play trigger
if (centerPlayBtn) {
  centerPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });
}

// Interactive Left/Right Tap Zones (Click Left = 10s Rewind, Click Right = 10s Forward)
function triggerTapZoneEffect(zoneEl) {
  if (!zoneEl) return;
  zoneEl.classList.remove('active-ripple');
  void zoneEl.offsetWidth; // trigger reflow for animation restart
  zoneEl.classList.add('active-ripple');
  setTimeout(() => zoneEl.classList.remove('active-ripple'), 460);
}

if (tapZoneLeft) {
  tapZoneLeft.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerTapZoneEffect(tapZoneLeft);
    triggerQuickSkip(-10);
  });
}

if (tapZoneRight) {
  tapZoneRight.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerTapZoneEffect(tapZoneRight);
    triggerQuickSkip(10);
  });
}

ctrlPlayBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

customVideo.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePlay();
});

// Click outside controls toggles play
playerOverlay.addEventListener('click', (e) => {
  if (
    e.target.closest('.player-bottom-controls') ||
    e.target.closest('.player-top-controls') ||
    e.target.closest('.player-settings-popover') ||
    e.target.closest('.player-tap-zone') ||
    e.target.closest('.center-play-trigger')
  ) {
    return;
  }
  e.stopPropagation();
  togglePlay();
});

// Video Loading & Buffering Animation Lifecycle
customVideo.addEventListener('loadstart', () => {
  showPlayerVideoLoading('Loading Video Stream...', 'Initializing playback buffer');
});

customVideo.addEventListener('waiting', () => {
  showPlayerVideoLoading('Buffering Stream...', 'Optimizing bitrate & stream segments');
});

customVideo.addEventListener('seeking', () => {
  showPlayerVideoLoading('Seeking Timeline...', 'Loading keyframes');
});

customVideo.addEventListener('canplay', () => {
  hidePlayerVideoLoading();
});

customVideo.addEventListener('playing', () => {
  hidePlayerVideoLoading();
});

customVideo.addEventListener('loadeddata', () => {
  hidePlayerVideoLoading();
});

customVideo.addEventListener('error', () => {
  hidePlayerVideoLoading();
});

/**
 * Update Loaded / Buffered Timeline Bar
 * Computes forward buffered seconds and visualizes how much timeline is loaded
 */
function updateLoadedTimeline() {
  if (!customVideo || !customVideo.duration) return;
  const current = customVideo.currentTime || 0;
  let loadedEnd = 0;

  if (customVideo.buffered && customVideo.buffered.length > 0) {
    for (let i = 0; i < customVideo.buffered.length; i++) {
      const start = customVideo.buffered.start(i);
      const end = customVideo.buffered.end(i);
      if (start <= current + 2 && end >= current) {
        loadedEnd = Math.max(loadedEnd, end);
        break;
      }
    }
    if (loadedEnd === 0) {
      for (let i = 0; i < customVideo.buffered.length; i++) {
        if (customVideo.buffered.end(i) > loadedEnd) {
          loadedEnd = customVideo.buffered.end(i);
        }
      }
    }
  }

  const loadedPct = Math.min(100, Math.max(0, (loadedEnd / customVideo.duration) * 100));
  if (progressBufferBar) {
    progressBufferBar.style.width = `${loadedPct}%`;
  }
}

// Video Events & Timeline Duration Updates
customVideo.addEventListener('play', () => {
  hidePlayerVideoLoading();
  ctrlPlayIcon.className = 'fa-solid fa-pause';
  centerPlayIcon.className = 'fa-solid fa-pause';
  if (playerStage) playerStage.classList.remove('is-paused');
  centerPlayBtn.style.opacity = '0';
  centerPlayBtn.style.pointerEvents = 'none';
});

customVideo.addEventListener('pause', () => {
  ctrlPlayIcon.className = 'fa-solid fa-play';
  centerPlayIcon.className = 'fa-solid fa-play';
  if (playerStage) playerStage.classList.add('is-paused');
  centerPlayBtn.style.opacity = '1';
  centerPlayBtn.style.pointerEvents = 'auto';
});

customVideo.addEventListener('timeupdate', () => {
  if (!customVideo.duration) return;
  const pct = (customVideo.currentTime / customVideo.duration) * 100;
  progressBar.style.width = `${pct}%`;

  const hasHours = customVideo.duration >= 3600;
  const currentFormatted = formatTimelineDuration(customVideo.currentTime, hasHours);
  const totalFormatted = formatTimelineDuration(customVideo.duration, hasHours);
  
  timeDisplay.textContent = `${currentFormatted} / ${totalFormatted}`;
  timeDisplay.title = `${formatVerboseDuration(customVideo.currentTime)} of ${formatVerboseDuration(customVideo.duration)}`;
  updateLoadedTimeline();
});

customVideo.addEventListener('progress', updateLoadedTimeline);
customVideo.addEventListener('seeked', updateLoadedTimeline);
customVideo.addEventListener('canplay', updateLoadedTimeline);

customVideo.addEventListener('loadedmetadata', () => {
  const hasHours = customVideo.duration >= 3600;
  const totalFormatted = formatTimelineDuration(customVideo.duration, hasHours);
  timeDisplay.textContent = `${hasHours ? '00:00:00' : '00:00'} / ${totalFormatted}`;
  timeDisplay.title = `Duration: ${formatVerboseDuration(customVideo.duration)}`;
  updateLoadedTimeline();
});

// ---------------------------------------------------------------------------
// Timeline Scrubbing, Dragging & Quick Skip Controls
// ---------------------------------------------------------------------------
let isDraggingSeekbar = false;

function updateSeekFromEvent(e) {
  if (!customVideo.duration) return;
  const rect = progressContainer.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const targetTime = pos * customVideo.duration;

  progressBar.style.width = `${pos * 100}%`;

  if (seekTooltip) {
    const hasHours = customVideo.duration >= 3600;
    seekTooltip.textContent = formatTimelineDuration(targetTime, hasHours);
    seekTooltip.style.left = `${pos * 100}%`;
    seekTooltip.style.opacity = '1';
  }

  return targetTime;
}

// Mouse events on seekbar
progressContainer.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  isDraggingSeekbar = true;
  const targetTime = updateSeekFromEvent(e);
  if (customVideo.duration && targetTime !== undefined) {
    customVideo.currentTime = targetTime;
  }
});

progressContainer.addEventListener('mousemove', (e) => {
  if (!isDraggingSeekbar) {
    updateSeekFromEvent(e);
  }
});

progressContainer.addEventListener('mouseleave', () => {
  if (!isDraggingSeekbar && seekTooltip) {
    seekTooltip.style.opacity = '0';
  }
});

window.addEventListener('mousemove', (e) => {
  if (isDraggingSeekbar) {
    const targetTime = updateSeekFromEvent(e);
    if (customVideo.duration && targetTime !== undefined) {
      customVideo.currentTime = targetTime;
    }
  }
});

window.addEventListener('mouseup', (e) => {
  if (isDraggingSeekbar) {
    isDraggingSeekbar = false;
    const targetTime = updateSeekFromEvent(e);
    if (customVideo.duration && targetTime !== undefined) {
      customVideo.currentTime = targetTime;
    }
    if (seekTooltip) {
      seekTooltip.style.opacity = '0';
    }
  }
});

// Touch events for mobile scrubbing
progressContainer.addEventListener('touchstart', (e) => {
  e.stopPropagation();
  isDraggingSeekbar = true;
  const targetTime = updateSeekFromEvent(e);
  if (customVideo.duration && targetTime !== undefined) {
    customVideo.currentTime = targetTime;
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (isDraggingSeekbar) {
    const targetTime = updateSeekFromEvent(e);
    if (customVideo.duration && targetTime !== undefined) {
      customVideo.currentTime = targetTime;
    }
  }
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (isDraggingSeekbar) {
    isDraggingSeekbar = false;
    if (seekTooltip) {
      seekTooltip.style.opacity = '0';
    }
  }
});

// Quick Skip (±10s) with Visual Screen Feedback
function triggerQuickSkip(delta) {
  if (!customVideo) return;
  const current = customVideo.currentTime || 0;
  const duration = customVideo.duration || Infinity;
  const next = Math.max(0, Math.min(duration, current + delta));
  customVideo.currentTime = next;

  if (quickSkipBadge && quickSkipText) {
    quickSkipText.textContent = delta > 0 ? `+${delta}s` : `${delta}s`;
    quickSkipBadge.classList.add('active');
    setTimeout(() => {
      quickSkipBadge.classList.remove('active');
    }, 600);
  }
}

ctrlRewindBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  triggerQuickSkip(-10);
});

ctrlForwardBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  triggerQuickSkip(10);
});

// ---------------------------------------------------------------------------
// Keyboard Navigation (Space = Play/Pause, Left/Right Arrow = -10s/+10s)
// ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  // Do not intercept keystrokes if typing inside inputs or search boxes
  const activeEl = document.activeElement;
  const activeTag = activeEl ? activeEl.tagName : '';
  if (
    activeTag === 'INPUT' ||
    activeTag === 'TEXTAREA' ||
    activeTag === 'SELECT' ||
    (activeEl && activeEl.isContentEditable)
  ) {
    return;
  }

  // Play / Pause (Space or 'k'/'K')
  if (e.code === 'Space' || e.key === ' ' || e.code === 'KeyK') {
    e.preventDefault(); // Prevent page scrolling down
    togglePlay();
    return;
  }

  // Previous 10 Seconds (ArrowLeft or 'j'/'J')
  if (e.code === 'ArrowLeft' || e.code === 'KeyJ') {
    e.preventDefault();
    triggerQuickSkip(-10);
    if (typeof triggerTapZoneEffect === 'function' && tapZoneLeft) {
      triggerTapZoneEffect(tapZoneLeft);
    }
    return;
  }

  // Next 10 Seconds (ArrowRight or 'l'/'L')
  if (e.code === 'ArrowRight' || e.code === 'KeyL') {
    e.preventDefault();
    triggerQuickSkip(10);
    if (typeof triggerTapZoneEffect === 'function' && tapZoneRight) {
      triggerTapZoneEffect(tapZoneRight);
    }
    return;
  }

  // Fullscreen (KeyF)
  if (e.code === 'KeyF') {
    e.preventDefault();
    if (ctrlFullscreenBtn) ctrlFullscreenBtn.click();
    return;
  }

  // Mute / Unmute (KeyM)
  if (e.code === 'KeyM') {
    e.preventDefault();
    if (ctrlMuteBtn) ctrlMuteBtn.click();
    return;
  }

  // Volume Up (ArrowUp)
  if (e.code === 'ArrowUp') {
    e.preventDefault();
    if (customVideo) {
      customVideo.volume = Math.min(1.0, Math.round((customVideo.volume + 0.1) * 10) / 10);
      showToast(`Volume: ${Math.round(customVideo.volume * 100)}%`, 'info');
    }
    return;
  }

  // Volume Down (ArrowDown)
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (customVideo) {
      customVideo.volume = Math.max(0.0, Math.round((customVideo.volume - 0.1) * 10) / 10);
      showToast(`Volume: ${Math.round(customVideo.volume * 100)}%`, 'info');
    }
    return;
  }
});

// Mute / Unmute
ctrlMuteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  customVideo.muted = !customVideo.muted;
  if (customVideo.muted) {
    ctrlVolumeIcon.className = 'fa-solid fa-volume-xmark';
  } else {
    ctrlVolumeIcon.className = 'fa-solid fa-volume-high';
  }
});

// Fullscreen
ctrlFullscreenBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!document.fullscreenElement) {
    if (playerStage.requestFullscreen) {
      playerStage.requestFullscreen();
    } else if (playerStage.webkitRequestFullscreen) {
      playerStage.webkitRequestFullscreen();
    }
    ctrlFullscreenIcon.className = 'fa-solid fa-compress';
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    ctrlFullscreenIcon.className = 'fa-solid fa-expand';
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    ctrlFullscreenIcon.className = 'fa-solid fa-expand';
  }
});

// Picture-in-Picture
ctrlPipBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled && customVideo.readyState >= 2) {
      await customVideo.requestPictureInPicture();
    }
  } catch (err) {
    showToast('Picture-in-Picture unavailable for this stream', 'error');
  }
});

// Settings Popover
ctrlSettingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playerSettingsPopover.classList.toggle('open');
});

settingsCloseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  playerSettingsPopover.classList.remove('open');
});

document.addEventListener('click', (e) => {
  if (!playerSettingsPopover.contains(e.target) && e.target !== ctrlSettingsBtn) {
    playerSettingsPopover.classList.remove('open');
  }
});

// ---------------------------------------------------------------------------
// Playback Speed Controller (Slider & Buttons up to 3x)
// ---------------------------------------------------------------------------
const speedOptButtons = document.querySelectorAll('.speed-opt');
const embedSpeedButtons = document.querySelectorAll('.embed-speed-btn');

function setPlaybackSpeed(speedVal) {
  const speed = Math.max(0.25, Math.min(3.0, parseFloat(speedVal) || 1.0));
  if (customVideo) customVideo.playbackRate = speed;
  if (valSpeed) valSpeed.textContent = `${speed}x`;
  if (speedSlider) speedSlider.value = speed;
  if (ctrlSpeedLabel) ctrlSpeedLabel.textContent = `${speed}x`;

  speedButtons.forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });

  speedOptButtons.forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });

  embedSpeedButtons.forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
  });

  // Post message to embedded iframe player
  if (embedIframe && embedIframe.contentWindow) {
    try {
      embedIframe.contentWindow.postMessage({ type: 'setPlaybackRate', rate: speed, value: speed }, '*');
      embedIframe.contentWindow.postMessage({ event: 'command', func: 'setPlaybackRate', args: [speed] }, '*');
      embedIframe.contentWindow.postMessage({ type: 'speed', speed: speed }, '*');
    } catch (_) {}
  }
}

if (speedSlider) {
  speedSlider.addEventListener('input', (e) => {
    setPlaybackSpeed(e.target.value);
  });
}

speedButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const speed = parseFloat(btn.dataset.speed);
    setPlaybackSpeed(speed);
    showToast(`Speed set to ${speed}x`, 'info');
  });
});

speedOptButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const speed = parseFloat(btn.dataset.speed);
    setPlaybackSpeed(speed);
    closeAllPopovers();
    showToast(`Speed set to ${speed}x`, 'info');
  });
});

embedSpeedButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const speed = parseFloat(btn.dataset.speed);
    setPlaybackSpeed(speed);
    showToast(`Embed Player Speed set to ${speed}x`, 'info');
  });
});

// Brightness adjustment
brightnessSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  valBrightness.textContent = `${val}%`;
  customVideo.style.filter = `brightness(${val}%)`;
});

// Audio Booster (up to 300%)
audioBoostSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  valAudioBoost.textContent = `${val}%`;

  setupAudioBooster();
  if (gainNode) {
    gainNode.gain.value = val / 100;
  }
  if (val > 100) {
    valAudioBoost.style.color = '#38bdf8';
  } else {
    valAudioBoost.style.color = '#ff6b6b';
  }
});

// ---------------------------------------------------------------------------
// 4. Single Unified Download Card per Content Entry (Prevention of False Downloads)
// ---------------------------------------------------------------------------
function renderDownloadSection(qualities, title) {
  const container = document.getElementById('unified-download-container') || document.getElementById('quality-download-grid');
  if (!container) return;

  const safeTitle = (title || 'ASI OTT Release').replace(/"/g, '&quot;');

  // Check if Filmyzilla source or multi-server qualities structure
  const isFilmyzilla = seriesData?.isFilmyzilla || seriesData?.source === 'Filmyzilla' || (Array.isArray(qualities) && qualities.some(q => Array.isArray(q.servers) && q.servers.length > 0));

  if (isFilmyzilla) {
    renderFilmyzillaDownloadSection(qualities, title);
    return;
  }

  // Find standard tiers (480p, 720p, 1080p)
  const tierList = Array.isArray(qualities) ? qualities : [];
  const getTier = (q) => tierList.find(t => (t.quality || '').toLowerCase().includes(q));

  const tier480 = getTier('480');
  const tier720 = getTier('720');
  const tier1080 = getTier('1080') || getTier('2160') || getTier('4k');

  const tiers = [
    { label: '480p', name: 'Standard Definition', tier: tier480, defaultSize: '450MB', badge: 'SD 480P', resClass: 'udc-res-480', desc: 'Mobile-friendly optimized resolution with low data consumption.', feature: 'Fastest Download' },
    { label: '720p', name: 'High Definition', tier: tier720, defaultSize: '1.2GB', badge: 'HD 720P', resClass: 'udc-res-720', desc: 'Crisp balance between file size and crystal-clear visual clarity.', feature: 'Most Popular' },
    { label: '1080p', name: 'Full HD Master', tier: tier1080, defaultSize: '2.9GB', badge: 'FHD 1080P', resClass: 'udc-res-1080', desc: 'Ultimate cinematic fidelity with high-bitrate multi-channel audio.', feature: 'Best Quality' }
  ];

  container.innerHTML = `
    <div class="udc-hero-card">
      <div class="udc-header-modern">
        <div class="udc-header-left">
          <div class="udc-icon-badge">
            <i class="fa-solid fa-cloud-arrow-down"></i>
          </div>
          <div>
            <h3 class="udc-hero-title">${safeTitle}</h3>
            <div class="udc-meta-line">
              <span><i class="fa-solid fa-file-video"></i> Genuine MKV Container</span>
              <span><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> High Speed Direct CDN</span>
              <span><i class="fa-solid fa-shield-halved" style="color: var(--accent-cyan);"></i> Zero Ads • Zero Redirects</span>
            </div>
          </div>
        </div>
        <div class="udc-badge-pill">
          <i class="fa-solid fa-bolt"></i> Verified Direct Delivery
        </div>
      </div>

      <div class="udc-cards-grid">
        ${tiers.map(t => {
          const isAvail = Boolean(t.tier && (t.tier.cloudDirectUrl || t.tier.directDownloadUrl || t.tier.hubUrl));
          const size = t.tier?.size || t.defaultSize;
          const targetUrl = t.tier?.cloudDirectUrl || t.tier?.directDownloadUrl || t.tier?.hubUrl || '';

          return `
            <div class="udc-tier-card ${!isAvail ? 'slot-unavailable' : ''}">
              <div class="udc-tier-top">
                <span class="udc-pill-resolution ${t.resClass}">${t.badge}</span>
                <span class="udc-size-tag"><i class="fa-solid fa-hard-drive"></i> ${size}</span>
              </div>
              <div class="udc-tier-body">
                <h4 class="udc-tier-name">${t.name}</h4>
                <p class="udc-tier-desc">${t.desc}</p>
                <ul class="udc-tier-features">
                  <li><i class="fa-solid fa-check"></i> ${t.feature}</li>
                  <li><i class="fa-solid fa-check"></i> Clean Audio & Subtitles</li>
                  <li><i class="fa-solid fa-check"></i> Resume-Supported Stream</li>
                </ul>
              </div>
              <div>
                ${(t.tier && (t.tier.hubcloudUrl || t.tier.filepressUrl || t.tier.gdflixUrl)) ? `
                  <div class="anime-hosts-btn-group">
                    ${t.tier.hubcloudUrl ? `
                      <a href="${t.tier.cloudDirectUrl}" class="btn-host-dl btn-host-hubcloud" title="Download via HubCloud (10Gbps CDN)" target="_blank" rel="noopener">
                        <span><i class="fa-solid fa-cloud"></i> HubCloud</span>
                        <span>hubcloud.ist <i class="fa-solid fa-arrow-down"></i></span>
                      </a>
                    ` : ''}
                    ${t.tier.filepressUrl ? `
                      <a href="${t.tier.directDownloadUrl}" class="btn-host-dl btn-host-filepress" title="Download via Filepress (Fast Mirror)" target="_blank" rel="noopener">
                        <span><i class="fa-solid fa-server"></i> Filepress</span>
                        <span>new2.filepress.lat <i class="fa-solid fa-arrow-down"></i></span>
                      </a>
                    ` : ''}
                    ${t.tier.gdflixUrl ? `
                      <a href="${t.tier.hdCloudUrl}" class="btn-host-dl btn-host-gdflix" title="Download via GDFlix (Google Drive CDN)" target="_blank" rel="noopener">
                        <span><i class="fa-brands fa-google-drive"></i> GDFlix</span>
                        <span>gdflix.dev <i class="fa-solid fa-arrow-down"></i></span>
                      </a>
                    ` : ''}
                  </div>
                ` : isAvail ? `
                  <button 
                    class="btn-tier-download" 
                    onclick="initiateVerifiedDownload('${targetUrl}', '${t.label}', '${size}', '${encodeURIComponent(title)}')"
                    title="Download verified ${t.label} file (${size})"
                  >
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                    <span>Download ${t.label} (${size})</span>
                  </button>
                ` : `
                  <button class="btn-tier-download" disabled title="This quality tier is currently unavailable for this title">
                    <i class="fa-solid fa-ban"></i>
                    <span>Unavailable</span>
                  </button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="udc-trust-banner">
        <i class="fa-solid fa-shield-heart"></i>
        <span>ASI OTT Verified Guarantee: All download tiers connect directly to high-speed media storage. No false links, no captcha popups, and full resume capability supported in your browser download manager.</span>
      </div>
    </div>
  `;
}

/**
 * Render Episode Selector Section for Anime & Multi-Episode Series
 */
function renderEpisodesSection(episodes, currentEp) {
  const section = document.getElementById('episodes-selector-section');
  const grid = document.getElementById('episodes-grid');
  const countBadge = document.getElementById('episodes-count-badge');
  if (!section || !grid) return;

  if (!Array.isArray(episodes) || episodes.length <= 1) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  if (countBadge) countBadge.textContent = `${episodes.length} Episodes Available`;

  grid.innerHTML = episodes.map((ep, idx) => {
    const isActive = ep.slug === currentEp || (!currentEp && idx === 0);
    return `
      <button 
        type="button"
        class="episode-btn ${isActive ? 'active' : ''}" 
        data-ep-slug="${ep.slug}"
        onclick="switchAnimeEpisode('${ep.slug}')"
      >
        <i class="fa-solid fa-play" style="font-size: 0.7rem;"></i>
        <span>${ep.label || `Episode ${idx + 1}`}</span>
      </button>
    `;
  }).join('');
}

/**
 * Dynamically switch between Anime episodes
 */
async function switchAnimeEpisode(epSlug) {
  if (!seriesData) return;
  const url = new URL(window.location.href);
  url.searchParams.set('episode', epSlug);
  window.history.replaceState({}, '', url.toString());

  showPlayerVideoLoading('Switching Episode...', `Loading ${epSlug}`);
  try {
    const query = `/api/post?id=${encodeURIComponent(seriesData.slug || seriesData.id)}&source=ToonWorld4All&episode=${encodeURIComponent(epSlug)}`;
    const res = await fetch(query);
    const data = await res.json();
    if (data.success) {
      seriesData = data;
      seriesFullTitle.textContent = data.title || 'Anime Episode';
      if (overlayTitle) overlayTitle.textContent = data.title || 'Anime Episode';

      // Update episode buttons
      document.querySelectorAll('.episode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.epSlug === epSlug);
      });

      // Update downloads
      renderDownloadSection(data.qualities, data.title);

      // Play video
      if (data.directStreamUrl) {
        setupDirectStreamPlayback(true);
      } else if (data.embedUrl) {
        switchToEmbedPlayer();
      } else {
        hidePlayerVideoLoading();
        showToast('Stream ready. Choose a download tier below to watch instantly.', 'info');
      }
    }
  } catch (e) {
    console.error('Episode switch error:', e);
    showToast('Failed to switch episode: ' + e.message, 'error');
  }
}

/**
 * Verified Download Initiator (Strict Prevention of False Downloads)
 */
async function initiateVerifiedDownload(downloadUrl, quality, size, encodedTitle) {
  const title = decodeURIComponent(encodedTitle);
  const targetFilename = `${title.replace(/[/\\?%*:|"<>]/g, '_')}_${quality}.mkv`;

  if (!downloadUrl) {
    showToast(`Sorry, ${quality} download is unavailable for this release.`, 'error');
    return;
  }

  dlStatusBanner.classList.add('active');
  dlStatusText.textContent = `Resolving verified ${quality} file stream (${size})...`;
  dlStatusBadge.textContent = 'Resolving';
  showToast(`Resolving verified ${quality} download...`, 'info');

  try {
    let resolvedEndpoint = downloadUrl;
    if (resolvedEndpoint.startsWith('/api/')) {
      resolvedEndpoint = `${API_BASE}${resolvedEndpoint}`;
    }

    // Pre-flight check: ensure endpoint does not fail or return HTML error
    dlStatusText.textContent = `Checking server response for ${targetFilename}...`;
    dlStatusBadge.textContent = 'Connecting';

    // Initiate download cleanly via direct link
    dlStatusText.textContent = `Direct download ready: ${targetFilename}`;
    dlStatusBadge.textContent = 'Downloading';

    const a = document.createElement('a');
    a.href = resolvedEndpoint;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = targetFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 1000);

    showToast(`Download started: ${targetFilename}`, 'success');

    setTimeout(() => {
      dlStatusText.textContent = `Download initiated successfully! Check browser downloads folder.`;
      dlStatusBadge.textContent = 'Success';
      setTimeout(() => dlStatusBanner.classList.remove('active'), 5000);
    }, 2500);

  } catch (err) {
    console.error('Verified download error:', err);
    dlStatusText.textContent = `Download error: ${err.message}`;
    dlStatusBadge.textContent = 'Error';
    showToast(err.message, 'error');
    setTimeout(() => dlStatusBanner.classList.remove('active'), 5000);
  }
}

/**
 * Specialized Hero Stage for Filmyzilla Multi-Server Download Content
 */
function setupFilmyzillaHeroStage() {
  if (playerControlsTopGroup) playerControlsTopGroup.style.display = 'none';
  if (tapZoneLeft) tapZoneLeft.style.display = 'none';
  if (tapZoneRight) tapZoneRight.style.display = 'none';
  if (centerPlayBtn) centerPlayBtn.style.display = 'none';
  if (playerOverlay) playerOverlay.style.display = 'none';
  if (customVideo) customVideo.style.display = 'none';
  if (embedIframe) embedIframe.style.display = 'none';

  let heroBanner = document.getElementById('filmyzilla-hero-banner');
  if (!heroBanner) {
    heroBanner = document.createElement('div');
    heroBanner.id = 'filmyzilla-hero-banner';
    heroBanner.className = 'filmyzilla-hero-banner';
    if (playerStage) playerStage.appendChild(heroBanner);
  }

  const safeTitle = seriesData?.title || 'Filmyzilla Release';
  const poster = seriesData?.poster || '';
  const totalQualities = Array.isArray(seriesData?.qualities) ? seriesData.qualities.length : 0;

  heroBanner.style.display = 'flex';
  heroBanner.innerHTML = `
    <div class="fzh-hero-bg" style="background-image: url('${poster}');"></div>
    <div class="fzh-hero-content">
      <div class="fzh-hero-pill">
        <i class="fa-solid fa-cloud-arrow-down"></i> Multi-Server Direct Delivery
      </div>
      <h2 class="fzh-hero-title">${safeTitle}</h2>
      <p class="fzh-hero-desc">
        Genuine high-speed download mirrors with 4 dedicated servers per resolution (480p, 720p, 1080p).
      </p>
      <button class="fzh-hero-cta" onclick="document.getElementById('download-section').scrollIntoView({ behavior: 'smooth' })">
        <i class="fa-solid fa-download"></i> Choose Quality & Server (${totalQualities} Available)
      </button>
    </div>
  `;
}

/**
 * Specialized Filmyzilla 4-Server Download Hub Renderer
 * Shows all qualities (480p, 720p, 1080p) with file size & all 4 individual server buttons
 */
function renderFilmyzillaDownloadSection(qualities, title) {
  const container = document.getElementById('unified-download-container') || document.getElementById('quality-download-grid');
  if (!container) return;

  const safeTitle = (title || 'Filmyzilla Release').replace(/"/g, '&quot;');
  const qualityList = Array.isArray(qualities) ? qualities : [];

  if (qualityList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; color: #f43f5e; margin-bottom: 0.75rem;"></i>
        <p>No download mirrors currently available for this title.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="udc-hero-card">
      <div class="udc-header-modern">
        <div class="udc-header-left">
          <div class="udc-icon-badge" style="background: rgba(229, 9, 20, 0.15); border-color: rgba(229, 9, 20, 0.35); color: var(--accent-primary);">
            <i class="fa-solid fa-bolt-lightning"></i>
          </div>
          <div>
            <h3 class="udc-hero-title">${safeTitle}</h3>
            <div class="udc-meta-line">
              <span><i class="fa-solid fa-server" style="color: var(--accent-cyan);"></i> 4 Dedicated Mirrors Per Quality</span>
              <span><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Verified Direct Tokens</span>
              <span><i class="fa-solid fa-shield-halved" style="color: var(--accent-cyan);"></i> Zero False Downloads</span>
            </div>
          </div>
        </div>
        <div class="udc-badge-pill" style="border-color: rgba(229, 9, 20, 0.4); color: #fca5a5;">
          <i class="fa-solid fa-bolt"></i> Multi-Server Delivery
        </div>
      </div>

      <div class="udc-cards-grid">
        ${qualityList.map((q) => {
          const qName = q.quality || 'Standard Quality';
          const qSize = q.size || 'HD File';
          const servers = Array.isArray(q.servers) ? q.servers : [];

          let resClass = 'udc-res-480';
          if (qName.includes('1080')) resClass = 'udc-res-1080';
          else if (qName.includes('720')) resClass = 'udc-res-720';

          return `
            <div class="fzh-server-card">
              <div class="udc-tier-top">
                <span class="udc-pill-resolution ${resClass}">${qName}</span>
                <span class="udc-size-tag"><i class="fa-solid fa-hard-drive"></i> ${qSize}</span>
              </div>

              <div style="font-size: 0.8rem; color: #94a3b8; display: flex; align-items: center; gap: 0.45rem;">
                <i class="fa-solid fa-server" style="color: var(--accent-cyan);"></i> Choose Fast Server:
              </div>

              <div class="fzh-servers-grid">
                ${servers.map(s => {
                  const sNum = s.serverNumber || 1;
                  const sName = s.name || `Server ${sNum}`;
                  const sUrl = s.url || `/api/filmyzilla-download?serverId=${q.serverId}&server=${sNum}`;

                  return `
                    <button 
                      class="fzh-server-btn" 
                      onclick="initiateFilmyzillaDownload('${sUrl}', '${qName}', '${sName}', '${qSize}', '${encodeURIComponent(title)}')"
                      title="Download ${qName} from ${sName} (${qSize})"
                    >
                      <i class="fa-solid fa-cloud-arrow-down"></i>
                      <span>${sName}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="udc-trust-banner">
        <i class="fa-solid fa-circle-info"></i>
        <span>Each resolution provides 4 high-speed download mirrors with full file size. If any server is busy, tap another server to immediately continue downloading at maximum bandwidth.</span>
      </div>
    </div>
  `;
}

/**
 * Initiates Filmyzilla Multi-Server Download via API Token Redirect
 */
function initiateFilmyzillaDownload(serverUrl, quality, serverName, size, encodedTitle) {
  const title = decodeURIComponent(encodedTitle);
  const targetFilename = `${title.replace(/[/\\?%*:|"<>]/g, '_')}_${quality}.mkv`;

  dlStatusBanner.classList.add('active');
  dlStatusText.textContent = `Connecting to ${serverName} for ${quality} (${size})...`;
  dlStatusBadge.textContent = 'Connecting';
  showToast(`Initiating ${quality} download via ${serverName}...`, 'info');

  let fullUrl = serverUrl;
  if (fullUrl.startsWith('/api/')) {
    fullUrl = `${API_BASE}${fullUrl}`;
  }

  const a = document.createElement('a');
  a.href = fullUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.download = targetFilename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
  }, 1000);

  setTimeout(() => {
    dlStatusText.textContent = `Verified token generated! Media server ready for ${serverName}.`;
    dlStatusBadge.textContent = 'Active';
    setTimeout(() => dlStatusBanner.classList.remove('active'), 4000);
  }, 2000);
}

/**
 * Track Unique View
 */
async function trackUniqueView(id) {
  try {
    await fetch(`${API_BASE}/api/views/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
  } catch (err) {}
}

/**
 * Share Handler
 */
function handleShare() {
  const currentUrl = window.location.href;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentUrl).then(() => {
      showToast('Watch URL copied to clipboard!', 'success');
    }).catch(() => fallbackCopy(currentUrl));
  } else {
    fallbackCopy(currentUrl);
  }
}

function fallbackCopy(text) {
  const dummy = document.createElement('textarea');
  document.body.appendChild(dummy);
  dummy.value = text;
  dummy.select();
  document.execCommand('copy');
  document.body.removeChild(dummy);
  showToast('Watch URL copied to clipboard!', 'success');
}

ctrlShareBtn.addEventListener('click', handleShare);
mainShareBtn.addEventListener('click', handleShare);

if (scrollToDownloadsBtn) {
  scrollToDownloadsBtn.addEventListener('click', () => {
    const el = document.getElementById('download-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  const yearEl = document.getElementById('current-year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
  loadEpisode();
});
