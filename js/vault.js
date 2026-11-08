/*
 * gfinanzas — caja fuerte
 * Los datos se guardan cifrados en el navegador con AES-GCM de 256 bits.
 * La clave se deriva de la contraseña con PBKDF2-SHA256 (600.000 iteraciones)
 * y una sal aleatoria. La contraseña nunca se guarda: si no se conoce, los
 * datos no se pueden descifrar.
 */
(function (root) {
  'use strict';

  const VAULT_KEY = 'gfinanzas.vault';
  const LEGACY_KEY = 'gfinanzas.v1'; // datos sin cifrar de versiones anteriores
  const GUARD_KEY = 'gfinanzas.guard'; // intentos fallidos
  const ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function deriveKey(password, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function readVault() {
    try {
      const v = JSON.parse(localStorage.getItem(VAULT_KEY));
      return v && v.ct ? v : null;
    } catch (e) {
      return null;
    }
  }

  async function seal(session, data) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.key, enc.encode(JSON.stringify(data)));
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        v: 1,
        kdf: 'PBKDF2-SHA256',
        iter: session.iter,
        salt: toB64(session.salt),
        iv: toB64(iv),
        ct: toB64(ct),
      })
    );
  }

  const Vault = {
    available: () => !!(root.crypto && crypto.subtle),
    exists: () => !!readVault(),

    readLegacy() {
      try {
        const raw = localStorage.getItem(LEGACY_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    /** Crea la caja con una contraseña nueva y devuelve la sesión abierta. */
    async create(password, data) {
      const salt = rand(16);
      const session = { key: await deriveKey(password, salt, ITERATIONS), salt, iter: ITERATIONS };
      await seal(session, data);
      localStorage.removeItem(LEGACY_KEY); // borra la copia sin cifrar
      Vault.resetGuard();
      return session;
    },

    /** Abre la caja. Lanza un error si la contraseña no es correcta. */
    async open(password) {
      const v = readVault();
      if (!v) throw new Error('No hay datos cifrados');
      const salt = fromB64(v.salt);
      const session = { key: await deriveKey(password, salt, v.iter), salt, iter: v.iter };
      try {
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(v.iv) }, session.key, fromB64(v.ct));
        Vault.resetGuard();
        return { session, data: JSON.parse(dec.decode(pt)) };
      } catch (e) {
        Vault.registerFail();
        const err = new Error('Contraseña incorrecta');
        err.wrong = true;
        throw err;
      }
    },

    /** Guarda los datos (las escrituras se encadenan para no pisarse). */
    _queue: Promise.resolve(),
    save(session, data) {
      const snapshot = JSON.parse(JSON.stringify(data));
      Vault._queue = Vault._queue.then(() => seal(session, snapshot));
      return Vault._queue;
    },

    /** Cambia la contraseña comprobando antes la actual. */
    async changePassword(current, next, data) {
      await Vault.open(current); // lanza si no es correcta
      return Vault.create(next, data);
    },

    wipe() {
      localStorage.removeItem(VAULT_KEY);
      localStorage.removeItem(LEGACY_KEY);
      localStorage.removeItem(GUARD_KEY);
    },

    // Bloqueo progresivo tras varios intentos fallidos
    guard() {
      try {
        return JSON.parse(localStorage.getItem(GUARD_KEY)) || { fails: 0, until: 0 };
      } catch (e) {
        return { fails: 0, until: 0 };
      }
    },
    registerFail() {
      const g = Vault.guard();
      g.fails++;
      // A partir del 5.º fallo: 30 s, 1 min, 2 min, 4 min… hasta 1 hora
      if (g.fails >= 5) g.until = Date.now() + Math.min(3600, 30 * 2 ** (g.fails - 5)) * 1000;
      localStorage.setItem(GUARD_KEY, JSON.stringify(g));
    },
    resetGuard() {
      localStorage.removeItem(GUARD_KEY);
    },
  };

  root.GVault = Vault;
})(window);
