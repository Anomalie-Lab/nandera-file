"use strict";
/**
 * Storage bridge — same contract as window.storage in the HTML prototype.
 * Replaces browser-local persistence with authenticated API + SQLite.
 */
(function () {
  async function api(path, options) {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options && options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options && options.headers),
      },
    });
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Unauthorized");
    }
    if (!res.ok) {
      let msg = "Request failed";
      try {
        const j = await res.json();
        msg = j.error || msg;
      } catch (_) {}
      throw new Error(msg);
    }
    return res;
  }

  window.storage = {
    async get(_key) {
      const res = await api("/api/store");
      const data = await res.json();
      return { value: JSON.stringify(data) };
    },
    async set(_key, value) {
      // value is already JSON.stringify(store)
      await api("/api/store", { method: "PUT", body: value });
    },
  };
})();
