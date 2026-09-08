// points.js - 各ページに読み込む共通ライブラリ
const PointsSystem = {
  KEY: 'pb_user_points',

  // 現在のポイントを取得
  get() {
    const points = localStorage.getItem(this.KEY);
    return points ? parseInt(points, 10) : 0;
  },

  // ポイントを加算/減算する
  add(amount) {
    const current = this.get();
    const updated = Math.max(0, current + amount);
    localStorage.setItem(this.KEY, updated);
    this._dispatchChangeEvent(updated);
    return updated;
  },

  // ポイントを直接設定する
  set(amount) {
    const updated = Math.max(0, amount);
    localStorage.setItem(this.KEY, updated);
    this._dispatchChangeEvent(updated);
    return updated;
  },

  // 他のタブやウインドウでポイントが更新された時のリアルタイム検知
  onChange(callback) {
    window.addEventListener('storage', (e) => {
      if (e.key === this.KEY) {
        callback(parseInt(e.newValue || '0', 10));
      }
    });
    window.addEventListener('pointsUpdated', (e) => {
      callback(e.detail.points);
    });
  },

  // 同一ページ内の更新通知用イベント
  _dispatchChangeEvent(points) {
    window.dispatchEvent(new CustomEvent('pointsUpdated', { detail: { points } }));
  }
};
