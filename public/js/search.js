/**
 * Search Module — 防抖搜索
 */

export class Search {
  /**
   * @param {object} opts
   * @param {HTMLInputElement} opts.inputEl
   * @param {HTMLElement} opts.clearBtn
   * @param {HTMLElement} opts.shortcutEl
   * @param {HTMLElement} opts.wrapperEl
   * @param {Function} opts.onSearch - (query) => void
   * @param {Function} opts.onClear - () => void
   * @param {number} [opts.debounceMs=350]
   */
  constructor(opts) {
    this.inputEl = opts.inputEl;
    this.clearBtn = opts.clearBtn;
    this.shortcutEl = opts.shortcutEl;
    this.wrapperEl = opts.wrapperEl;
    this.onSearch = opts.onSearch;
    this.onClear = opts.onClear;
    this.debounceMs = opts.debounceMs || 350;

    this._timer = null;
    this._abortController = null;
    this._lastQuery = '';

    this._bindEvents();
  }

  /**
   * 执行搜索
   */
  async search(query) {
    query = query.trim();

    if (query === this._lastQuery) return null;
    this._lastQuery = query;

    if (!query) {
      this.onClear?.();
      return null;
    }

    // 取消之前的请求
    if (this._abortController) {
      this._abortController.abort();
    }
    this._abortController = new AbortController();

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: this._abortController.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.onSearch?.(data.images, query);
      return data;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Search failed:', err);
      }
      return null;
    }
  }

  /**
   * 清除搜索
   */
  clear() {
    this.inputEl.value = '';
    this._lastQuery = '';
    this.wrapperEl.classList.remove('has-query');
    this.onClear?.();
  }

  /**
   * 聚焦搜索框
   */
  focus() {
    this.inputEl.focus();
  }

  // ===== 内部方法 =====

  _bindEvents() {
    // 输入防抖
    this.inputEl.addEventListener('input', () => {
      const value = this.inputEl.value.trim();

      // 更新 UI 状态
      if (value) {
        this.wrapperEl.classList.add('has-query');
      } else {
        this.wrapperEl.classList.remove('has-query');
      }

      // 防抖
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this.search(value);
      }, this.debounceMs);
    });

    // 清除按钮
    this.clearBtn.addEventListener('click', () => {
      this.clear();
      this.inputEl.focus();
    });

    // ESC 清除搜索
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.inputEl.value) {
          this.clear();
        } else {
          this.inputEl.blur();
        }
      }
    });

    // 全局快捷键 "/" 聚焦搜索
    document.addEventListener('keydown', (e) => {
      // 排除已在输入框中的情况
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        this.inputEl.focus();
      }
    });
  }
}
