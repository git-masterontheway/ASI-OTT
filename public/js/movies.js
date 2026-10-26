/**
 * ASI OTT - Dedicated Movies Hub Controller (Version 2.0.0)
 * Features:
 * - Exact ASI OTT Card Markup & Styling (Identical to Home Page)
 * - Pure referer domain category mapping (Zero category bleeding)
 * - Full-width search bar with real-time movie search & zero mini drama
 * - Smooth category drilldown and multi-section showcases
 * - Direct watch redirection to watch.html?id=...&source=...
 */

const VERCEL_BACKEND = 'https://asiott.vercel.app';
const API_BASE = '';

// State
let currentCategory = 'all';
let currentFilter = 'all';
let currentSearchQuery = '';
let currentPage = 1;
let currentPagination = null;
let allItems = [];
let cachedSections = null;
let searchDebounceTimer = null;

// DOM Elements
const moviesSectionsContainer = document.getElementById('movies-sections-container');
const moviesSingleView = document.getElementById('movies-single-view');
const moviesGrid = document.getElementById('movies-grid');
const singleViewHeading = document.getElementById('single-view-heading');
const itemsCounter = document.getElementById('items-counter');
const paginationWrapper = document.getElementById('pagination-wrapper');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const searchSubmitBtn = document.getElementById('search-submit-btn');
const searchCategorySelect = document.getElementById('search-category-select');
const categoryTabs = document.querySelectorAll('.category-tabs-wrapper .cat-tab');
const filterChips = document.querySelectorAll('#quick-filter-chips .chip');

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
 * Robust API Fetch Helper
 */
async function fetchApi(pathWithQuery) {
  const primaryUrl = `${API_BASE}${pathWithQuery}`;
  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return data;
    }
  } catch (err) {
    console.warn('Primary API fetch failed, attempting Vercel fallback...', err);
  }

  // Fallback to Vercel production backend
  if (!primaryUrl.startsWith(VERCEL_BACKEND)) {
    try {
      const fallbackRes = await fetch(`${VERCEL_BACKEND}${pathWithQuery}`);
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData && fallbackData.success) return fallbackData;
      }
    } catch (_) {}
  }

  throw new Error('Could not retrieve movies from aggregation sources');
}

/**
 * Renders an Individual Movie Card with 100% Exact ASI OTT Card Markup & Design
 */
function createMovieCard(item) {
  const card = document.createElement('div');
  card.className = 'series-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const safeTitle = (item.title || 'Untitled Movie').replace(/"/g, '&quot;');
  card.setAttribute('title', safeTitle);

  const placeholderImg = 'https://m.microtv.st/assets/images/placeholder.jpg';
  const thumbUrl = item.thumbnail || placeholderImg;

  // Quality Tag formatting
  let qualityTag = item.quality || 'HD 1080p';
  if (safeTitle.toLowerCase().includes('4k') || safeTitle.toLowerCase().includes('2160p')) {
    qualityTag = '4K UHD';
  } else if (safeTitle.toLowerCase().includes('dual audio')) {
    qualityTag = 'Dual Audio';
  } else if (safeTitle.toLowerCase().includes('multi audio')) {
    qualityTag = 'Multi Audio';
  }

  // Category Tag formatting
  const catLabel = item.category || 'Movie';
  const catClass = catLabel.toLowerCase().replace(/\s+/g, '-');

  // Clean views formatting
  let cleanViews = String(item.views || '1.8K')
    .replace(/👁️/g, '')
    .replace(/views/gi, '')
    .trim();
  if (!cleanViews) cleanViews = '1.8K';

  card.innerHTML = `
    <div class="poster-wrapper">
      <img 
        src="${thumbUrl}" 
        alt="${safeTitle}" 
        class="series-poster"
        loading="lazy"
        onerror="this.onerror=null; this.src='${placeholderImg}';"
      >
      <div class="poster-gradient"></div>
      
      <!-- Top Category Badge -->
      <div class="card-badges-top">
        <span class="category-badge badge-${catClass}">${catLabel}</span>
      </div>

      <!-- Bottom Caption Quality Badge -->
      <div class="card-caption-badge">
        <i class="fa-solid fa-closed-captioning"></i> ${qualityTag}
      </div>

      <!-- Play Hover Overlay Circle -->
      <div class="play-hover-overlay">
        <div class="play-icon-circle">
          <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
        </div>
      </div>
    </div>
    <div class="series-info">
      <h3 class="series-title">${safeTitle}</h3>
      
      <!-- Meta Row with Views & Watch Button -->
      <div class="series-meta">
        <span class="views"><i class="fa-solid fa-eye"></i> ${cleanViews} views</span>
        <span class="watch-online-cta"><i class="fa-solid fa-play"></i> Watch</span>
      </div>
    </div>
  `;

  // Navigate to Watch page with movie ID & source
  const navigateToWatch = () => {
    const watchUrl = `/watch.html?id=${encodeURIComponent(item.id || item.slug)}&source=${encodeURIComponent(item.source || 'Movies4u')}`;
    window.location.href = watchUrl;
  };

  card.addEventListener('click', navigateToWatch);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToWatch();
    }
  });

  return card;
}

/**
 * 1. Load All Categorized Movie Sections (Multi-Section Showcase)
 */
async function loadMovieSections() {
  currentCategory = 'all';
  currentSearchQuery = '';
  updateActiveTab('all');

  moviesSingleView.style.display = 'none';
  moviesSectionsContainer.style.display = 'block';

  // Render Skeleton Logo Loader
  moviesSectionsContainer.innerHTML = `
    <div class="grid-logo-loader-container">
      <div class="grid-logo-loader">
        <div class="gll-logo-wrapper">
          <div class="gll-glow-halo"></div>
          <img src="/logo.png" alt="Loading" class="gll-logo-img">
        </div>
        <div class="gll-bar-track">
          <div class="gll-bar-fill"></div>
        </div>
      </div>
    </div>
  `;

  try {
    const data = await fetchApi('/api/movies/sections');
    cachedSections = data.sections || [];

    if (!cachedSections.length) {
      moviesSectionsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-film"></i>
          <h3>No Movies Available Currently</h3>
          <p>Connecting to movie referer mirrors. Please try refreshing.</p>
          <button class="btn btn-primary" onclick="loadMovieSections()"><i class="fa-solid fa-rotate-right"></i> Refresh</button>
        </div>
      `;
      return;
    }

    moviesSectionsContainer.innerHTML = '';

    cachedSections.forEach((section) => {
      const items = section.items || [];
      if (!items.length) return;

      const sectionBlock = document.createElement('section');
      sectionBlock.className = 'movie-section-container';

      sectionBlock.innerHTML = `
        <div class="movie-section-topbar">
          <div class="movie-section-left">
            <div>
              <h2 class="movie-section-heading">
                <i class="fa-solid ${section.icon || 'fa-film'}"></i>
                <span>${section.title}</span>
                <span class="movie-badge-pill">${section.badge || 'HD'}</span>
              </h2>
              <p class="movie-section-sub">${section.subtitle || 'Streaming & High-Speed Direct Downloads'}</p>
            </div>
          </div>
          <button class="movie-explore-btn" onclick="selectMovieCategory('${section.id}')">
            <span>Explore All</span>
            <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
        <div class="series-grid" id="grid-${section.id}"></div>
      `;

      const gridEl = sectionBlock.querySelector(`#grid-${section.id}`);
      items.forEach((item) => {
        gridEl.appendChild(createMovieCard(item));
      });

      moviesSectionsContainer.appendChild(sectionBlock);
    });

  } catch (err) {
    console.error('Failed to load movie sections:', err);
    moviesSectionsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Unable to Load Movies</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="loadMovieSections()"><i class="fa-solid fa-rotate-right"></i> Retry Loading</button>
      </div>
    `;
    showToast('Failed to load movie sections', 'error');
  }
}

/**
 * 2. Load Specific Movie Category (Grid View with Full Pagination)
 */
async function loadMovieCategory(category, page = 1) {
  currentCategory = category;
  currentSearchQuery = '';
  currentPage = page;
  updateActiveTab(category);

  moviesSectionsContainer.style.display = 'none';
  moviesSingleView.style.display = 'block';

  const categoryNames = {
    new_releases: 'New Releases (2026)',
    bollywood: 'Bollywood Movies (Hindi)',
    hollywood: 'Hollywood Movies (Dual Audio)',
    south_movies: 'South Indian Movies (Hindi Dubbed)',
    korean_movies: 'Korean & Asian Cinema',
    web_series: 'Web Series & Shows'
  };

  const displayName = categoryNames[category] || 'Movies';
  singleViewHeading.innerHTML = `<i class="fa-solid fa-film"></i> ${displayName.toUpperCase()}`;
  if (itemsCounter) itemsCounter.style.display = 'none';

  // Render Grid Loader
  moviesGrid.innerHTML = `
    <div class="grid-logo-loader-container">
      <div class="grid-logo-loader">
        <div class="gll-logo-wrapper">
          <div class="gll-glow-halo"></div>
          <img src="/logo.png" alt="Loading" class="gll-logo-img">
        </div>
        <div class="gll-bar-track">
          <div class="gll-bar-fill"></div>
        </div>
      </div>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    params.set('category', 'movies');
    params.set('genre', category);
    if (page > 1) params.set('page', page);

    const data = await fetchApi(`/api/content?${params.toString()}`);
    allItems = data.items || [];
    currentPagination = data.pagination;

    renderMovieGrid(allItems);
    renderPagination(currentPagination);

    if (itemsCounter) {
      itemsCounter.textContent = `${allItems.length} movies loaded`;
      itemsCounter.style.display = 'inline-block';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error('Failed to load category:', err);
    moviesGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Failed to Load ${displayName}</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="loadMovieCategory('${category}', ${page})"><i class="fa-solid fa-rotate-right"></i> Retry</button>
      </div>
    `;
    showToast(`Failed to load ${displayName}`, 'error');
  }
}

/**
 * 3. Search Movies (Zero Mini Drama Guaranteed)
 */
async function searchMovies(query, page = 1) {
  if (!query || !query.trim()) {
    if (currentCategory === 'all') {
      loadMovieSections();
    } else {
      loadMovieCategory(currentCategory, 1);
    }
    return;
  }

  currentSearchQuery = query.trim();
  currentPage = page;

  moviesSectionsContainer.style.display = 'none';
  moviesSingleView.style.display = 'block';

  singleViewHeading.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search Results for "${currentSearchQuery}"`;
  if (itemsCounter) itemsCounter.style.display = 'none';

  moviesGrid.innerHTML = `
    <div class="grid-logo-loader-container">
      <div class="grid-logo-loader">
        <div class="gll-logo-wrapper">
          <div class="gll-glow-halo"></div>
          <img src="/logo.png" alt="Loading" class="gll-logo-img">
        </div>
        <div class="gll-bar-track">
          <div class="gll-bar-fill"></div>
        </div>
      </div>
    </div>
  `;

  try {
    const params = new URLSearchParams();
    params.set('q', currentSearchQuery);
    params.set('type', 'movies');
    params.set('no_drama', '1');
    params.set('exclude_minidrama', 'true');
    params.set('category', 'movies');
    if (page > 1) params.set('page', page);

    const data = await fetchApi(`/api/search?${params.toString()}`);
    // Strict Guard: Filter out any MicroTV or Mini Drama items
    allItems = (data.items || []).filter(i => i.category !== 'Mini Drama' && i.source !== 'MicroTV');
    currentPagination = data.pagination;

    renderMovieGrid(allItems);
    renderPagination(currentPagination);

    if (itemsCounter) {
      itemsCounter.textContent = `${allItems.length} movies found`;
      itemsCounter.style.display = 'inline-block';
    }
  } catch (err) {
    console.error('Search failed:', err);
    moviesGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Search Encountered an Issue</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="searchMovies('${query}', ${page})"><i class="fa-solid fa-rotate-right"></i> Try Again</button>
      </div>
    `;
    showToast('Search request failed', 'error');
  }
}

/**
 * Render Movies into Grid with Quick Sorting Filter
 */
function renderMovieGrid(items) {
  moviesGrid.innerHTML = '';

  if (!items || items.length === 0) {
    moviesGrid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-film"></i>
        <h3>No Movies Found</h3>
        <p>No titles matched your criteria. Try searching with a different movie name or actor.</p>
        <button class="btn btn-primary" onclick="loadMovieSections()"><i class="fa-solid fa-film"></i> Browse All Movies</button>
      </div>
    `;
    return;
  }

  // Quick Sorting Filter
  let sorted = [...items];
  if (currentFilter === 'popular') {
    sorted.sort((a, b) => {
      const vA = parseFloat(String(a.views || '0').replace(/[^0-9.]/g, '')) || 0;
      const vB = parseFloat(String(b.views || '0').replace(/[^0-9.]/g, '')) || 0;
      return vB - vA;
    });
  } else if (currentFilter === 'recent') {
    sorted.reverse();
  }

  sorted.forEach(item => {
    moviesGrid.appendChild(createMovieCard(item));
  });
}

/**
 * Render Responsive Floating Glass OTT Pagination Controls
 */
function renderPagination(pagination) {
  if (!pagination || !pagination.totalPages || pagination.totalPages <= 1) {
    paginationWrapper.style.display = 'none';
    paginationWrapper.innerHTML = '';
    return;
  }

  paginationWrapper.style.display = 'flex';
  paginationWrapper.innerHTML = '';

  const cur = pagination.currentPage || 1;
  const total = pagination.totalPages || 1;

  let html = `
    <div class="pagination-header-info">
      <span class="pagination-badge">
        <i class="fa-solid fa-layer-group"></i> Page <strong>${cur}</strong> of <strong>${total}</strong>
      </span>
    </div>
    <div class="pagination-controls">
  `;

  // Previous Page Button
  if (cur > 1) {
    html += `
      <button class="page-btn page-arrow" onclick="handlePageNav(${cur - 1})" title="Go to Previous Page">
        <i class="fa-solid fa-chevron-left"></i> <span>Prev</span>
      </button>
    `;
  } else {
    html += `
      <button class="page-btn page-arrow disabled" disabled title="Previous Page">
        <i class="fa-solid fa-chevron-left"></i> <span>Prev</span>
      </button>
    `;
  }

  // Calculate clean range of pages to show
  const pagesToShow = [];
  pagesToShow.push(1);

  let start = Math.max(2, cur - 2);
  let end = Math.min(total - 1, cur + 2);

  if (start > 2) pagesToShow.push('dots1');
  for (let i = start; i <= end; i++) {
    pagesToShow.push(i);
  }
  if (end < total - 1) pagesToShow.push('dots2');
  if (total > 1) pagesToShow.push(total);

  pagesToShow.forEach(p => {
    if (typeof p === 'string') {
      html += `<span class="page-dots"><i class="fa-solid fa-ellipsis"></i></span>`;
    } else {
      html += `
        <button class="page-btn page-num ${p === cur ? 'active' : ''}" onclick="handlePageNav(${p})" title="Page ${p}">
          ${p}
        </button>
      `;
    }
  });

  // Next Page Button
  if (cur < total) {
    html += `
      <button class="page-btn page-arrow" onclick="handlePageNav(${cur + 1})" title="Go to Next Page">
        <span>Next</span> <i class="fa-solid fa-chevron-right"></i>
      </button>
    `;
  } else {
    html += `
      <button class="page-btn page-arrow disabled" disabled title="Next Page">
        <span>Next</span> <i class="fa-solid fa-chevron-right"></i>
      </button>
    `;
  }

  html += `</div>`;
  paginationWrapper.innerHTML = html;
}

/**
 * Global Page Navigation Handler with Smooth Auto-Scroll
 */
window.handlePageNav = function(p) {
  if (p < 1) return;

  // Smooth scroll back to top of content grid
  const anchor = document.getElementById('single-view-heading') || 
                 document.getElementById('movies-single-view') || 
                 document.getElementById('main-content-wrapper');
  if (anchor) {
    const yOffset = -120;
    const y = anchor.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  if (currentSearchQuery) {
    searchMovies(currentSearchQuery, p);
  } else {
    loadMovieCategory(currentCategory, p);
  }
};

/**
 * Update Active Category Tab Style
 */
function updateActiveTab(category) {
  categoryTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === category);
  });
  if (searchCategorySelect) {
    searchCategorySelect.value = category;
  }
}

/**
 * Global Helper for Category Selection from Inline Links
 */
window.selectMovieCategory = function(category) {
  if (category === 'all') {
    loadMovieSections();
  } else {
    loadMovieCategory(category, 1);
  }
};

/**
 * Event Listeners & Initialization
 */
document.addEventListener('DOMContentLoaded', () => {
  // Set current year
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Category Tabs Click
  categoryTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const cat = tab.dataset.category;
      if (cat === 'all') {
        loadMovieSections();
      } else {
        loadMovieCategory(cat, 1);
      }
    });
  });

  // Category Dropdown Change
  if (searchCategorySelect) {
    searchCategorySelect.addEventListener('change', (e) => {
      const cat = e.target.value;
      if (cat === 'all') {
        loadMovieSections();
      } else {
        loadMovieCategory(cat, 1);
      }
    });
  }

  // Quick Filter Chips (All, Popular, Recent)
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderMovieGrid(allItems);
    });
  });

  // Search Input Real-Time Debounce
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (searchClearBtn) {
        searchClearBtn.style.display = val.length > 0 ? 'flex' : 'none';
      }

      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchMovies(val, 1);
      }, 400);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchDebounceTimer);
        searchMovies(searchInput.value, 1);
      }
    });
  }

  // Clear Search Button
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.style.display = 'none';
      searchInput.focus();
      if (currentCategory === 'all') {
        loadMovieSections();
      } else {
        loadMovieCategory(currentCategory, 1);
      }
    });
  }

  // Submit Search Button
  if (searchSubmitBtn) {
    searchSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearTimeout(searchDebounceTimer);
      searchMovies(searchInput.value, 1);
    });
  }

  // Check URL parameters (e.g. ?category=bollywood or ?q=avatar)
  const urlParams = new URLSearchParams(window.location.search);
  const qParam = urlParams.get('q');
  const catParam = urlParams.get('category') || urlParams.get('genre');

  if (qParam) {
    if (searchInput) {
      searchInput.value = qParam;
      if (searchClearBtn) searchClearBtn.style.display = 'flex';
    }
    searchMovies(qParam, 1);
  } else if (catParam && catParam !== 'all') {
    loadMovieCategory(catParam, 1);
  } else {
    loadMovieSections();
  }
});
