const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(
  path.join(root, "..", "account-status-report-manager.html"),
  "utf8"
);

const storageBridge = fs.readFileSync(
  path.join(root, "public", "asr-storage.js"),
  "utf8"
);

const logoutBtn = `
<script>
document.addEventListener("DOMContentLoaded", function () {
  var tools = document.querySelector(".tools");
  if (!tools || document.getElementById("logoutBtn")) return;
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
});
</script>
`;

// Inject storage bridge BEFORE the app script so load()/save() hit the API
const out = html.replace(
  "<script>\n\"use strict\";",
  `<script>${storageBridge}</script>\n<script>\n"use strict";`
).replace("</body>", `${logoutBtn}\n</body>`);

fs.writeFileSync(path.join(root, "public", "manager.html"), out, "utf8");
console.log("Wrote public/manager.html", out.length);
