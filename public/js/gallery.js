/**
 * Gallery Module — 瀑布流画廊、懒加载、无限滚动
 */

export class Gallery {
  /**
   * @param {object} opts
   * @param {string} opts.r2PublicUrl - R2 公开域名
   * @param {HTMLElement} opts.galleryEl - 画廊容器
   * @param {HTMLElement} opts.loadMoreEl - 加载更多指示器
   * @param {HTMLElement} opts.sentinelEl - 滚动哨兵
   * @param {HTMLElement} opts.emptyEl - 空状态
   * @param {HTMLElement} opts.skeletonEl - 骨架屏
   * @param {HTMLElement} opts.errorEl - 错误状态
   * @param {HTMLElement} opts.errorMsgEl - 错误消息
   * @param {Function} opts.onImageClick - 图片点击回调
   * @param {Function} opts.onCountChange - 图片总数变化回调
   */
  constructor(opts) {
    this.r2Url = opts.r2PublicUrl.replace(/\/$/, '');
    this.galleryEl = opts.galleryEl;
    this.loadMoreEl = opts.loadMoreEl;
    this.sentinelEl = opts.sentinelEl;
    this.emptyEl = opts.emptyEl;
    this.skeletonEl = opts.skeletonEl;
    this.errorEl = opts.errorEl;
    this.errorMsgEl = opts.errorMsgEl;
    this.onImageClick = opts.onImageClick;
    this.onCountChange = opts.onCountChange;

    // 状态
    this.images = [];
    this.afterKey = null;
    this.hasMore = true;
    this.loading = false;
    this.currentGame = '';
    this.cardIndex = 0; // 用于动画延迟

    // JS 分列管理（避免 CSS columns 重排）
    this.columns = [];
    this._currentColCount = 0;

    // 懒加载 Observer
    this.lazyObserver = new IntersectionObserver(
      (entries) => this._onLazyIntersect(entries),
      { rootMargin: '200px 0px' }
    );

    // 无限滚动 Observer
    this.scrollObserver = new IntersectionObserver(
      (entries) => this._onScrollIntersect(entries),
      { rootMargin: '800px 0px' }
    );
    this.scrollObserver.observe(this.sentinelEl);

    // 滚动事件兜底
    this._scrollHandler = this._onScroll.bind(this);
    window.addEventListener('scroll', this._scrollHandler, { passive: true });

    // 窗口缩放时重建列
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this._onResize(), 200);
    });
  }

  /**
   * 加载指定游戏的图片（重置画廊）
   */
  async loadGame(game = '') {
    this.currentGame = game;
    this.images = [];
    this.afterKey = null;
    this.hasMore = true;
    this.cardIndex = 0;

    // 重建列容器
    this._initColumns();
    this._hideEmpty();
    this._hideError();
    this._showSkeleton();

    await this.loadMore();
    this._hideSkeleton();
  }

  /**
   * 显示搜索结果（替换画廊内容）
   */
  showSearchResults(images) {
    this.images = images;
    this.afterKey = null;
    this.hasMore = false;
    this.cardIndex = 0;

    this._initColumns();
    this._hideError();
    this._hideSkeleton();

    if (images.length === 0) {
      this._showEmpty();
      this._hideLoadMore();
    } else {
      this._hideEmpty();
      this._renderCards(images);
      this._hideLoadMore();
    }

    this.onCountChange?.(images.length);
  }

  /**
   * 加载更多图片（追加到画廊）
   */
  async loadMore() {
    if (this.loading || !this.hasMore) return;
    this.loading = true;
    this._showLoadMore();

    try {
      const params = new URLSearchParams({ limit: '30' });
      if (this.currentGame) params.set('game', this.currentGame);
      if (this.afterKey) params.set('after', this.afterKey);

      const res = await fetch(`/api/images?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      this.afterKey = data.nextAfter;
      this.hasMore = data.hasMore;

      if (data.images.length > 0) {
        this.images.push(...data.images);
        this._renderCards(data.images);
        this._hideEmpty();
      } else if (this.images.length === 0) {
        this._showEmpty();
      }

      if (!this.hasMore) {
        this._hideLoadMore();
      }

      this.onCountChange?.(this.images.length);
    } catch (err) {
      console.error('Failed to load images:', err);
      if (this.images.length === 0) {
        this._showError(err.message);
        this._hideSkeleton();
      }
    } finally {
      this.loading = false;
      if (this.hasMore) {
        this._showLoadMore();
        // 加载完成后检查哨兵是否已在视口内，如果是则继续加载
        requestAnimationFrame(() => this._checkSentinel());
      } else {
        this._hideLoadMore();
      }
    }
  }

  /**
   * 获取图片的完整 URL
   */
  getImageUrl(key) {
    return `${this.r2Url}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  }

  // ===== 内部方法 =====

  // ---------- 列管理 ----------

  _getColumnCount() {
    const w = window.innerWidth;
    if (w >= 1800) return 6;
    if (w >= 1440) return 5;
    if (w >= 1024) return 4;
    if (w >= 640)  return 3;
    return 2;
  }

  _initColumns() {
    this.galleryEl.innerHTML = '';
    const count = this._getColumnCount();
    this._currentColCount = count;
    this.columns = [];
    for (let i = 0; i < count; i++) {
      const col = document.createElement('div');
      col.className = 'gallery-column';
      this.galleryEl.appendChild(col);
      this.columns.push(col);
    }
  }

  _getShortestColumnIndex() {
    let minH = Infinity;
    let minIdx = 0;
    for (let i = 0; i < this.columns.length; i++) {
      const h = this.columns[i].offsetHeight;
      if (h < minH) {
        minH = h;
        minIdx = i;
      }
    }
    return minIdx;
  }

  _onResize() {
    const newCount = this._getColumnCount();
    if (newCount === this._currentColCount) return;

    // 收集所有现有卡片
    const cards = [];
    for (const col of this.columns) {
      while (col.firstChild) {
        cards.push(col.removeChild(col.firstChild));
      }
    }

    // 用新列数重建
    this._initColumns();

    // 重新分配卡片到最短列
    for (const card of cards) {
      const idx = this._getShortestColumnIndex();
      this.columns[idx].appendChild(card);
    }
  }

  // ---------- 渲染 ----------

  _renderCards(images) {
    for (const img of images) {
      const card = this._createCard(img, this.cardIndex);
      const colIdx = this._getShortestColumnIndex();
      this.columns[colIdx].appendChild(card);
      this.cardIndex++;
    }
  }

  _createCard(img, index) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.style.animationDelay = `${Math.min(index * 30, 400)}ms`;

    // 找到该图片在总列表中的索引
    const globalIndex = this.images.indexOf(img);
    card.dataset.index = globalIndex !== -1 ? globalIndex : index;

    // 图片元素（懒加载）
    const imgEl = document.createElement('img');
    imgEl.dataset.src = this.getImageUrl(img.key);
    imgEl.alt = img.name || img.key;
    imgEl.loading = 'lazy';
    imgEl.decoding = 'async';

    // 图片加载完成后显示
    imgEl.addEventListener('load', () => {
      imgEl.classList.add('loaded');
    });

    imgEl.addEventListener('error', () => {
      // 加载失败时显示占位
      imgEl.style.minHeight = '120px';
      imgEl.style.background = 'var(--bg-tertiary)';
      imgEl.classList.add('loaded');
    });

    // Overlay 信息
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';

    if (img.game) {
      const gameBadge = document.createElement('div');
      gameBadge.className = 'card-game';
      gameBadge.textContent = img.game;
      overlay.appendChild(gameBadge);
    }

    const nameLabel = document.createElement('div');
    nameLabel.className = 'card-name';
    nameLabel.textContent = img.name || img.key;
    overlay.appendChild(nameLabel);

    card.appendChild(imgEl);
    card.appendChild(overlay);

    // 注册懒加载
    this.lazyObserver.observe(imgEl);

    // 点击事件
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.index, 10);
      this.onImageClick?.(idx);
    });

    return card;
  }

  _onLazyIntersect(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
          this.lazyObserver.unobserve(img);
        }
      }
    }
  }

  _onScrollIntersect(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting && this.hasMore && !this.loading) {
        this.loadMore();
      }
    }
  }

  _onScroll() {
    if (this.loading || !this.hasMore) return;
    this._checkSentinel();
  }

  _checkSentinel() {
    if (this.loading || !this.hasMore) return;
    const rect = this.sentinelEl.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    // 如果哨兵距离视口底部不到 800px，触发加载
    if (rect.top < windowHeight + 800) {
      this.loadMore();
    }
  }

  _showLoadMore() { this.loadMoreEl.classList.add('visible'); }
  _hideLoadMore() { this.loadMoreEl.classList.remove('visible'); }
  _showEmpty()    { this.emptyEl.classList.add('visible'); }
  _hideEmpty()    { this.emptyEl.classList.remove('visible'); }
  _showSkeleton() { this.skeletonEl.classList.add('visible'); }
  _hideSkeleton() { this.skeletonEl.classList.remove('visible'); }

  _showError(msg) {
    this.errorMsgEl.textContent = msg || '无法连接到服务器';
    this.errorEl.classList.add('visible');
  }
  _hideError() { this.errorEl.classList.remove('visible'); }
}
