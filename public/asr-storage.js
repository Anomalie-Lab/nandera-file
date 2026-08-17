"use strict";
/**
 * Storage bridge — same contract as window.storage in the HTML prototype.
 * Replaces browser-local persistence with authenticated API + SQLite.
 * Also applies role UI: CLIENT users are report-only / read-only.
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

  function applyViewerMode(viewer) {
    window.ASR_VIEWER = viewer || { role: "ADMIN", canEdit: true, canManageUsers: false, user: "", email: "" };
    const client = window.ASR_VIEWER.role === "CLIENT";
    const superadmin = Boolean(window.ASR_VIEWER.canManageUsers);
    document.documentElement.classList.toggle("role-client", client);
    document.body && document.body.classList.toggle("role-client", client);
    document.documentElement.classList.toggle("role-superadmin", superadmin);
    document.body && document.body.classList.toggle("role-superadmin", superadmin);
    if (client) {
      document.querySelectorAll(".tab").forEach(function (t) {
        t.classList.toggle("active", t.getAttribute("data-tab") === "report");
      });
      document.querySelectorAll(".panel").forEach(function (p) {
        p.classList.toggle("active", p.id === "panel-report");
      });
      var who = document.getElementById("signedInAs");
      if (who) who.textContent = window.ASR_VIEWER.user || window.ASR_VIEWER.email || "Client";
    }
  }

  window.ASR_VIEWER = { role: "ADMIN", canEdit: true, canManageUsers: false, user: "", email: "" };

  window.storage = {
    async get(_key) {
      const res = await api("/api/store");
      const data = await res.json();
      applyViewerMode(data.viewer);
      const store = { ...data };
      delete store.viewer;
      return { value: JSON.stringify(store) };
    },
    async set(_key, value) {
      if (window.ASR_VIEWER && window.ASR_VIEWER.canEdit === false) return null;
      const res = await api("/api/store", { method: "PUT", body: value });
      return res.json();
    },
  };
})();
