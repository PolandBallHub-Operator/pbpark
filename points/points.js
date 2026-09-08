// points.js - PB Park 共通ポイントライブラリ
// 公開API: window.PBPoints（PointsSystem は後方互換用の別名）
(() => {
  const KEY = 'pb_user_points';

  const toSafePoints = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.floor(number));
  };

  const read = () => {
    try {
      return toSafePoints(localStorage.getItem(KEY));
    } catch (error) {
      console.error('PBPointsの読み込みに失敗しました:', error);
      return 0;
    }
  };

  const notify = (points) => {
    window.dispatchEvent(new CustomEvent('pointsUpdated', {
      detail: { points }
    }));
  };

  const PBPoints = {
    KEY,

    // 現在のポイントを取得
    get() {
      return read();
    },

    // ポイントを加算/減算する。残高は0未満にならない
    add(amount) {
      const updated = toSafePoints(read() + (Number.isFinite(Number(amount)) ? Number(amount) : 0));
      try {
        localStorage.setItem(KEY, String(updated));
      } catch (error) {
        console.error('PBPointsの保存に失敗しました:', error);
      }
      notify(updated);
      return updated;
    },

    // ポイントを直接設定する
    set(amount) {
      const updated = toSafePoints(amount);
      try {
        localStorage.setItem(KEY, String(updated));
      } catch (error) {
        console.error('PBPointsの保存に失敗しました:', error);
      }
      notify(updated);
      return updated;
    },

    // 他のタブ/同一ページでのポイント変更を監視
    onChange(callback) {
      if (typeof callback !== 'function') return () => {};

      const onStorage = (event) => {
        if (event.key === KEY) callback(toSafePoints(event.newValue));
      };
      const onPointsUpdated = (event) => {
        callback(toSafePoints(event.detail && event.detail.points));
      };

      window.addEventListener('storage', onStorage);
      window.addEventListener('pointsUpdated', onPointsUpdated);

      // 購読解除用関数を返す
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('pointsUpdated', onPointsUpdated);
      };
    }
  };

  // launcher は PBPoints を利用するため、必ず window に公開する。
  window.PBPoints = PBPoints;
  // 旧実装/既存ツールとの互換性を維持する。
  window.PointsSystem = PBPoints;
})();
