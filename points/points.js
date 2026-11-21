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

  /* =====================================================================
   * PBData - ゲームへ「ゲーム内ポイント／アイテム／任意データ」を付与する汎用API
   *
   * しくみ:
   *   イベントページ等 → PBData.send(gameId, gift) → ゲームの「受信ボックス」へ届く
   *   ゲーム側        → PBData.inbox(gameId) で一覧 → ユーザーが受取 → PBData.consume(gameId, id)
   *   同じオリジン（pbpark配下）の localStorage を共有するため、サーバー不要。
   *
   * gift の形:
   *   {
   *     id:    'event-2026-final',      // 必須。同じidは二重に送れない（重複防止）
   *     title: '最終日スペシャル',        // 受信ボックスの見出し
   *     desc:  'ODAチケット ×3 …',       // 任意の説明
   *     items: { coins:2000, oda:3 },   // 数量アイテム（キーは英小文字・数字・_ 、値は0以上の整数）
   *     data:  { any: 'json' },         // 任意のJSONデータ（ゲーム側が自由に解釈）
   *     from:  'CountryPark',           // 送信元の表示名
   *     expiresAt: 1790000000000        // 任意。期限(ms)。過ぎたら受信ボックスから消える
   *   }
   * ===================================================================== */
  const P = 'pb_data_';
  const ID_RE = /^[A-Za-z0-9_.:\-]{1,64}$/;
  const ITEM_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
  const MAX_ITEM = 1e6;
  const MAX_INBOX = 100;
  const MAX_DATA_BYTES = 8000;
  const EV_INBOX = 'pbdata:inbox';
  const EV_STORE = 'pbdata:store';

  const gameOk = (g) => typeof g === 'string' && ID_RE.test(g);
  const kInbox = (g) => `${P}inbox_v1:${g}`;
  const kSent = (g) => `${P}sent_v1:${g}`;
  const kStore = (g) => `${P}store_v1:${g}`;

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (error) {
      return fallback;
    }
  };
  const writeJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('PBDataの保存に失敗しました:', error);
      return false;
    }
  };

  const cleanItems = (items) => {
    const out = {};
    if (!items || typeof items !== 'object') return out;
    Object.keys(items).forEach((k) => {
      if (!ITEM_KEY_RE.test(k)) return;
      const n = Math.min(MAX_ITEM, Math.floor(Number(items[k])));
      if (Number.isFinite(n) && n > 0) out[k] = n;
    });
    return out;
  };

  const cleanData = (data) => {
    if (data == null) return null;
    try {
      const s = JSON.stringify(data);
      if (s.length > MAX_DATA_BYTES) return null;
      return JSON.parse(s);
    } catch (error) {
      return null;
    }
  };

  const normalizeGift = (gift) => {
    if (!gift || typeof gift !== 'object' || typeof gift.id !== 'string' || !ID_RE.test(gift.id)) return null;
    const items = cleanItems(gift.items);
    const data = cleanData(gift.data);
    if (!Object.keys(items).length && data == null) return null;
    const exp = Number(gift.expiresAt);
    return {
      id: gift.id,
      title: String(gift.title || 'プレゼント').slice(0, 40),
      desc: String(gift.desc || '').slice(0, 120),
      from: String(gift.from || 'PB Park').slice(0, 24),
      items,
      data,
      at: Date.now(),
      expiresAt: Number.isFinite(exp) && exp > 0 ? exp : 0
    };
  };

  const liveInbox = (g) => {
    const now = Date.now();
    const list = readJSON(kInbox(g), []);
    return (Array.isArray(list) ? list : [])
      .filter((x) => x && typeof x.id === 'string' && ID_RE.test(x.id) && (!x.expiresAt || x.expiresAt > now));
  };

  const emitInbox = (g) => {
    window.dispatchEvent(new CustomEvent(EV_INBOX, { detail: { gameId: g, inbox: liveInbox(g) } }));
  };

  const PBData = {
    // ---- 送信側（イベントページ・管理ツールなど）----

    // ゲームの受信ボックスへギフトを送る。同じ gift.id は一度しか送れない
    // 戻り値: { ok:true, gift } | { ok:false, reason:'invalid'|'duplicate'|'full'|'storage' }
    send(gameId, gift) {
      if (!gameOk(gameId)) return { ok: false, reason: 'invalid' };
      const g = normalizeGift(gift);
      if (!g) return { ok: false, reason: 'invalid' };

      const sent = readJSON(kSent(gameId), []);
      if (sent.includes(g.id)) return { ok: false, reason: 'duplicate' };

      const inbox = liveInbox(gameId);
      if (inbox.length >= MAX_INBOX) return { ok: false, reason: 'full' };
      inbox.push(g);
      sent.push(g.id);
      // 送信済み台帳を先に書く（途中で失敗しても二重送信にならない）
      if (!writeJSON(kSent(gameId), sent.slice(-500))) return { ok: false, reason: 'storage' };
      if (!writeJSON(kInbox(gameId), inbox)) return { ok: false, reason: 'storage' };
      emitInbox(gameId);
      return { ok: true, gift: g };
    },

    // 送信済みか（受信ボックスから消えた後も true）
    wasSent(gameId, id) {
      return gameOk(gameId) && readJSON(kSent(gameId), []).includes(id);
    },

    // ---- 受信側（ゲーム）----

    // 受信ボックスの一覧（期限切れは除く）
    inbox(gameId) {
      return gameOk(gameId) ? liveInbox(gameId) : [];
    },

    // 受け取り完了。受信ボックスから取り除き、取り除いたギフトを返す（なければ null）
    // ※ 先に consume して、戻り値のギフトの中身をゲームへ反映すること（二重受け取り防止）
    consume(gameId, id) {
      if (!gameOk(gameId)) return null;
      const inbox = liveInbox(gameId);
      const idx = inbox.findIndex((x) => x.id === id);
      if (idx < 0) return null;
      const [gift] = inbox.splice(idx, 1);
      if (!writeJSON(kInbox(gameId), inbox)) return null;
      emitInbox(gameId);
      return gift;
    },

    // 受信ボックスの変更を監視（他タブ・同一ページ両方）。解除関数を返す
    onInbox(gameId, callback) {
      if (!gameOk(gameId) || typeof callback !== 'function') return () => {};
      const onStorage = (event) => {
        if (event.key === kInbox(gameId)) callback(liveInbox(gameId));
      };
      const onLocal = (event) => {
        if (event.detail && event.detail.gameId === gameId) callback(liveInbox(gameId));
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(EV_INBOX, onLocal);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(EV_INBOX, onLocal);
      };
    },

    // ---- ゲームごとの汎用データ置き場（key-value）----

    get(gameId, key, fallback = null) {
      if (!gameOk(gameId)) return fallback;
      const store = readJSON(kStore(gameId), {});
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback;
    },

    set(gameId, key, value) {
      if (!gameOk(gameId) || typeof key !== 'string' || !key || key.length > 64) return false;
      const safe = cleanData(value);
      if (safe == null && value != null) return false;
      const store = readJSON(kStore(gameId), {});
      store[key] = safe;
      if (!writeJSON(kStore(gameId), store)) return false;
      window.dispatchEvent(new CustomEvent(EV_STORE, { detail: { gameId, key, value: safe } }));
      return true;
    },

    remove(gameId, key) {
      if (!gameOk(gameId)) return false;
      const store = readJSON(kStore(gameId), {});
      delete store[key];
      return writeJSON(kStore(gameId), store);
    },

    onStore(gameId, callback) {
      if (!gameOk(gameId) || typeof callback !== 'function') return () => {};
      const onStorage = (event) => {
        if (event.key === kStore(gameId)) callback({ gameId, key: null, value: null });
      };
      const onLocal = (event) => {
        if (event.detail && event.detail.gameId === gameId) callback(event.detail);
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(EV_STORE, onLocal);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(EV_STORE, onLocal);
      };
    }
  };

  // launcher は PBPoints を利用するため、必ず window に公開する。
  window.PBPoints = PBPoints;
  // 旧実装/既存ツールとの互換性を維持する。
  window.PointsSystem = PBPoints;
  // ゲームへの付与用の汎用 data API
  window.PBData = PBData;
})();
