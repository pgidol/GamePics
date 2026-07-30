/**
 * Lightbox Module — 全屏图片预览、键盘/触摸导航
 */

export class Lightbox {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.lightboxEl
   * @param {HTMLElement} opts.imageEl
   * @param {HTMLElement} opts.spinnerEl
   * @param {HTMLElement} opts.filenameEl
   * @param {HTMLElement} opts.gameEl
   * @param {HTMLElement} opts.counterEl
   * @param {HTMLElement} opts.sizeEl
   * @param {HTMLElement} opts.prevBtn
   * @param {HTMLElement} opts.nextBtn
   * @param {HTMLElement} opts.closeBtn
   * @param {HTMLElement} opts.backdropEl
   * @param {Function} opts.getImageUrl - (key) => url
   */
  constructor(opts) {
    this.el = opts.lightboxEl;
    this.imageEl = opts.imageEl;
    this.spinnerEl = opts.spinnerEl;
    this.filenameEl = opts.filenameEl;
    this.gameEl = opts.gameEl;
    this.counterEl = opts.counterEl;
    this.sizeEl = opts.sizeEl;
    this.prevBtn = opts.prevBtn;
    this.nextBtn = opts.nextBtn;
    this.closeBtn = opts.closeBtn;
    this.backdropEl = opts.backdropEl;
    this.getImageUrl = opts.getImageUrl;

    // 状态
    this.images = [];
    this.currentIndex = -1;
    this.isOpen = false;

    // 触摸手势
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchDeltaX = 0;
    this._isSwiping = false;

    this._bindEvents();
  }

  /**
   * 设置图片列表
   */
  setImages(images) {
    this.images = images;
  }

  /**
   * 打开灯箱
   */
  open(index) {
    if (index < 0 || index >= this.images.length) return;

    this.currentIndex = index;
    this.isOpen = true;

    this.el.classList.add('open');
    document.body.classList.add('lightbox-open');

    this._showImage(index);
    this._updateNav();
    this._preloadAdjacent();
  }

  /**
   * 关闭灯箱
   */
  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
    document.body.classList.remove('lightbox-open');

    // 清理当前图片
    setTimeout(() => {
      this.imageEl.classList.remove('visible');
      this.imageEl.src = '';
    }, 300);
  }

  /**
   * 上一张
   */
  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this._showImage(this.currentIndex);
      this._updateNav();
      this._preloadAdjacent();
    }
  }

  /**
   * 下一张
   */
  next() {
    if (this.currentIndex < this.images.length - 1) {
      this.currentIndex++;
      this._showImage(this.currentIndex);
      this._updateNav();
      this._preloadAdjacent();
    }
  }

  // ===== 内部方法 =====

  _showImage(index) {
    const img = this.images[index];
    if (!img) return;

    const url = this.getImageUrl(img.key);

    // 显示加载中
    this.imageEl.classList.remove('visible');
    this.spinnerEl.classList.add('visible');

    // 更新信息
    this.filenameEl.textContent = img.name || img.key;
    this.gameEl.textContent = img.game || '';
    this.counterEl.textContent = `${index + 1} / ${this.images.length}`;
    this.sizeEl.textContent = img.sizeFormatted || '';

    // 加载图片
    const newImg = new Image();
    newImg.onload = () => {
      if (this.currentIndex === index) {
        this.imageEl.src = url;
        this.spinnerEl.classList.remove('visible');
        // 用 rAF 确保浏览器已渲染
        requestAnimationFrame(() => {
          this.imageEl.classList.add('visible');
        });
      }
    };
    newImg.onerror = () => {
      if (this.currentIndex === index) {
        this.spinnerEl.classList.remove('visible');
        this.imageEl.src = url; // 仍然设置，让浏览器显示 broken image
        this.imageEl.classList.add('visible');
      }
    };
    newImg.src = url;
  }

  _updateNav() {
    this.prevBtn.style.opacity = this.currentIndex > 0 ? '1' : '0.2';
    this.prevBtn.style.pointerEvents = this.currentIndex > 0 ? 'auto' : 'none';

    this.nextBtn.style.opacity = this.currentIndex < this.images.length - 1 ? '1' : '0.2';
    this.nextBtn.style.pointerEvents = this.currentIndex < this.images.length - 1 ? 'auto' : 'none';
  }

  _preloadAdjacent() {
    const preload = (idx) => {
      if (idx >= 0 && idx < this.images.length) {
        const img = new Image();
        img.src = this.getImageUrl(this.images[idx].key);
      }
    };
    preload(this.currentIndex - 1);
    preload(this.currentIndex + 1);
  }

  _bindEvents() {
    // 关闭按钮
    this.closeBtn.addEventListener('click', () => this.close());

    // 背景点击关闭
    this.backdropEl.addEventListener('click', () => this.close());

    // 导航按钮
    this.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
    this.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      switch (e.key) {
        case 'Escape':
          this.close();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.next();
          break;
      }
    });

    // 触摸手势
    this.el.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
    this.el.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.el.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });

    // 阻止图片右键菜单（可选）
    this.imageEl.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _onTouchStart(e) {
    if (e.touches.length !== 1) return;
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
    this._touchDeltaX = 0;
    this._isSwiping = false;
  }

  _onTouchMove(e) {
    if (e.touches.length !== 1) return;

    const dx = e.touches[0].clientX - this._touchStartX;
    const dy = e.touches[0].clientY - this._touchStartY;

    // 判断是否为水平滑动
    if (!this._isSwiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      this._isSwiping = true;
    }

    if (this._isSwiping) {
      e.preventDefault();
      this._touchDeltaX = dx;
      // 视觉反馈：图片跟随手指
      this.imageEl.style.transform = `translateX(${dx * 0.4}px)`;
    }
  }

  _onTouchEnd() {
    if (!this._isSwiping) return;

    // 复位图片位置
    this.imageEl.style.transform = '';

    const threshold = 60;
    if (this._touchDeltaX > threshold) {
      this.prev();
    } else if (this._touchDeltaX < -threshold) {
      this.next();
    }

    this._isSwiping = false;
    this._touchDeltaX = 0;
  }
}
