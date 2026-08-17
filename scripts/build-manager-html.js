const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const parentHtml = path.join(root, "..", "account-status-report-manager.html");
const outPath = path.join(root, "public", "manager.html");

if (!fs.existsSync(parentHtml)) {
  console.log(
    "No original HTML at",
    parentHtml,
    "- keeping public/manager.html"
  );
  process.exit(0);
}

const html = fs.readFileSync(parentHtml, "utf8");

const storageBridge = fs.readFileSync(
  path.join(root, "public", "asr-storage.js"),
  "utf8"
);

const logoutBtn = `
<script>
document.addEventListener("DOMContentLoaded", function () {
  var tools = document.querySelector(".tools");
  if (tools && !document.getElementById("logoutBtn")) {
    var b = document.createElement("button");
    b.id = "logoutBtn";
    b.className = "btn";
    b.type = "button";
    b.textContent = "Sign out";
    b.addEventListener("click", async function () {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      window.location.href = "/login";
    });
    tools.appendChild(b);
  }
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      var el = document.getElementById("signedInAs");
      if (el && me && (me.user || me.email)) el.textContent = me.user || me.email;
      if (me && me.role === "CLIENT") {
        document.documentElement.classList.add("role-client");
        document.body.classList.add("role-client");
      }
    })
    .catch(function () {});
});
</script>
`;

const out = html
  .replace(
    "<script>\n\"use strict\";",
    `<script>${storageBridge}</script>\n<script>\n"use strict";`
  )
  .replace("</body>", `${logoutBtn}\n</body>`);

fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote public/manager.html", out.length);
