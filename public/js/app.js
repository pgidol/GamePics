/**
 * GamePics — 主应用入口
 * 协调 Gallery / Lightbox / Search 模块
 */

import { Gallery } from './gallery.js';
import { Lightbox } from './lightbox.js';
import { Search } from './search.js';

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  R2_PUBLIC_URL: 'https://r2.yuege.fun',
  API_BASE: '/api',
  PAGE_SIZE: 30,
};

// ============================================================
// DOM 引用
// ============================================================
const $ = (sel) => document.querySelector(sel);

const dom = {
  // Header
  header:        $('#header'),
  searchWrapper: $('#searchWrapper'),
  searchInput:   $('#searchInput'),
  searchClear:   $('#searchClear'),
  searchShortcut:$('#searchShortcut'),
  statsText:     $('#statsText'),

  // Category
  categoryScroll: $('#categoryScroll'),
  chipAll:        $('#chipAll'),

  // Gallery
  gallery:     $('#gallery'),
  loadMore:    $('#loadMore'),
  sentinel:    $('#scrollSentinel'),
  emptyState:  $('#emptyState'),
  skeletonGrid:$('#skeletonGrid'),
  errorState:  $('#errorState'),
  errorMessage:$('#errorMessage'),
  retryBtn:    $('#retryBtn'),

  // Lightbox
  lightbox:        $('#lightbox'),
  lightboxImage:   $('#lightboxImage'),
  lightboxSpinner: $('#lightboxSpinner'),
  lightboxFilename:$('#lightboxFilename'),
  lightboxGame:    $('#lightboxGame'),
  lightboxCounter: $('#lightboxCounter'),
  lightboxSize:    $('#lightboxSize'),
  lightboxPrev:    $('#lightboxPrev'),
  lightboxNext:    $('#lightboxNext'),
  lightboxClose:   $('#lightboxClose'),
  lightboxBackdrop:$('#lightboxBackdrop'),

  // Misc
  backToTop: $('#backToTop'),

  // Sort
  sortControl:  $('#sortControl'),
  sortBtn:      $('#sortBtn'),
  sortLabel:    $('#sortLabel'),
  sortDropdown: $('#sortDropdown'),

  // Mobile Stats
  mobileStatsText: $('#mobileStatsText'),
};

// ============================================================
// 初始化模块
// ============================================================
const gallery = new Gallery({
  r2PublicUrl: CONFIG.R2_PUBLIC_URL,
  galleryEl:   dom.gallery,
  loadMoreEl:  dom.loadMore,
  sentinelEl:  dom.sentinel,
  emptyEl:     dom.emptyState,
  skeletonEl:  dom.skeletonGrid,
  errorEl:     dom.errorState,
  errorMsgEl:  dom.errorMessage,
  onImageClick: (index) => openLightbox(index),
  onCountChange: (count) => updateStats(count),
  onSortChange: (sort) => updateSortUI(sort),
});

const lightbox = new Lightbox({
  lightboxEl:  dom.lightbox,
  imageEl:     dom.lightboxImage,
  spinnerEl:   dom.lightboxSpinner,
  filenameEl:  dom.lightboxFilename,
  gameEl:      dom.lightboxGame,
  counterEl:   dom.lightboxCounter,
  sizeEl:      dom.lightboxSize,
  prevBtn:     dom.lightboxPrev,
  nextBtn:     dom.lightboxNext,
  closeBtn:    dom.lightboxClose,
  backdropEl:  dom.lightboxBackdrop,
  getImageUrl: (key) => gallery.getImageUrl(key),
});

const search = new Search({
  inputEl:    dom.searchInput,
  clearBtn:   dom.searchClear,
  shortcutEl: dom.searchShortcut,
  wrapperEl:  dom.searchWrapper,
  onSearch:   (images, query) => handleSearchResults(images, query),
  onClear:    () => handleSearchClear(),
});

// ============================================================
// 应用状态
// ============================================================
let currentGame = '';
let isSearchMode = false;
let games = [];
let totalCount = null; // 总截图数

// ============================================================
// 游戏分类
// ============================================================
async function loadGames() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/games`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    games = data.games || [];
    renderCategories(games);
  } catch (err) {
    console.error('Failed to load games:', err);
    // 即使分类加载失败，画廊仍然可用
  }
}

function renderCategories(games) {
  // 保留"全部"按钮，添加游戏分类
  for (const game of games) {
    const chip = document.createElement('button');
    chip.className = 'category-chip';
    chip.dataset.game = game.name;
    chip.innerHTML = `<span>${escapeHtml(game.name)}</span>`;

    chip.addEventListener('click', () => selectGame(game.name));
    dom.categoryScroll.appendChild(chip);
  }
}

function selectGame(gameName) {
  if (currentGame === gameName && !isSearchMode) return;

  currentGame = gameName;
  isSearchMode = false;

  // 清除搜索
  if (dom.searchInput.value) {
    search.clear();
  }

  // 更新分类高亮
  updateCategoryHighlight(gameName);

  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 并行加载图片和总数
  gallery.loadGame(gameName);
  fetchTotalCount(gameName);
}

/**
 * 获取图片总数
 */
async function fetchTotalCount(game = '') {
  try {
    const params = new URLSearchParams();
    if (game) params.set('game', game);
    const res = await fetch(`${CONFIG.API_BASE}/count?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    totalCount = data.total;
    updateStats(gallery.images.length);
  } catch (err) {
    console.error('Failed to fetch count:', err);
    totalCount = null;
  }
}

function updateCategoryHighlight(gameName) {
  const chips = dom.categoryScroll.querySelectorAll('.category-chip');
  for (const chip of chips) {
    const isActive = chip.dataset.game === gameName;
    chip.classList.toggle('active', isActive);

    // 滚动到可见
    if (isActive) {
      chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }
}

// "全部" 按钮事件
dom.chipAll.addEventListener('click', () => selectGame(''));

// ============================================================
// 搜索处理
// ============================================================
function handleSearchResults(images, query) {
  isSearchMode = true;
  // 取消分类高亮
  updateCategoryHighlight(null);

  gallery.showSearchResults(images);
  lightbox.setImages(images);
  updateStats(images.length, query, images.length);
}

function handleSearchClear() {
  isSearchMode = false;
  // 重新加载当前分类
  selectGame(currentGame);
}

// ============================================================
// Lightbox 相关
// ============================================================
function openLightbox(index) {
  lightbox.setImages(gallery.images);
  lightbox.open(index);
}

// ============================================================
// UI 更新
// ============================================================
function updateStats(loadedCount, searchQuery, searchTotal) {
  let text;
  if (searchQuery) {
    text = `找到 ${searchTotal} 张匹配截图`;
  } else if (totalCount !== null) {
    if (loadedCount >= totalCount) {
      text = `共 ${totalCount} 张截图`;
    } else {
      text = `共 ${totalCount} 张截图 · 已加载 ${loadedCount} 张`;
    }
  } else {
    text = `已加载 ${loadedCount} 张截图`;
  }
  dom.statsText.textContent = text;
  // 同步到移动端状态栏
  if (dom.mobileStatsText) {
    dom.mobileStatsText.textContent = text;
  }
}

// ============================================================
// 回到顶部按钮
// ============================================================
let lastScrollY = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;

  // 显示/隐藏回到顶部按钮
  dom.backToTop.classList.toggle('visible', y > 600);

  // Header 滚动效果（可选：向下滚动时收缩）
  lastScrollY = y;
}, { passive: true });

dom.backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ============================================================
// 重试按钮
// ============================================================
dom.retryBtn.addEventListener('click', () => {
  gallery.loadGame(currentGame);
});

// ============================================================
// 排序控制
// ============================================================
const SORT_LABELS = { newest: '最新', oldest: '最旧' };

function updateSortUI(sort) {
  dom.sortLabel.textContent = SORT_LABELS[sort] || SORT_LABELS.newest;
  // 更新选项高亮
  dom.sortDropdown.querySelectorAll('.sort-option').forEach((opt) => {
    const isActive = opt.dataset.sort === sort;
    opt.classList.toggle('active', isActive);
    opt.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

// 切换下拉菜单
dom.sortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dom.sortControl.classList.toggle('open');
});

// 选择排序选项
dom.sortDropdown.querySelectorAll('.sort-option').forEach((opt) => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    const sort = opt.dataset.sort;
    dom.sortControl.classList.remove('open');
    gallery.setSort(sort);
    // 切换排序后也需要重新获取总数
    fetchTotalCount(currentGame);
  });
});

// 点击外部关闭下拉菜单
document.addEventListener('click', (e) => {
  if (!dom.sortControl.contains(e.target)) {
    dom.sortControl.classList.remove('open');
  }
});

// ESC 关闭下拉菜单
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dom.sortControl.classList.contains('open')) {
    dom.sortControl.classList.remove('open');
  }
});

// ============================================================
// URL Hash 路由
// ============================================================
function readHash() {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  return params.get('game') || '';
}

function writeHash(game) {
  if (game) {
    window.location.hash = `game=${encodeURIComponent(game)}`;
  } else {
    // 清除 hash 而不触发滚动
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

window.addEventListener('hashchange', () => {
  const game = readHash();
  if (game !== currentGame && !isSearchMode) {
    selectGame(game);
  }
});

// 劫持 selectGame 以同步 hash
const _originalSelectGame = selectGame;
// 用事件方式更新 hash
const originalChipHandler = dom.chipAll.onclick;

// ============================================================
// 工具函数
// ============================================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// 启动应用
// ============================================================
async function init() {
  // 从 URL hash 读取初始游戏
  const initialGame = readHash();
  currentGame = initialGame;

  // 并行加载分类、图片和总数
  const gamesPromise = loadGames();
  const imagesPromise = gallery.loadGame(initialGame);
  const countPromise = fetchTotalCount(initialGame);

  await Promise.all([gamesPromise, imagesPromise, countPromise]);

  // 如果有初始游戏，更新高亮
  if (initialGame) {
    updateCategoryHighlight(initialGame);
  }

  console.log('🎮 GamePics initialized');
}

// 等待 DOM 就绪
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 将 selectGame 包装以更新 hash
const chipButtons = dom.categoryScroll.querySelectorAll('.category-chip');
// 这由 selectGame 内部处理，无需额外包装
