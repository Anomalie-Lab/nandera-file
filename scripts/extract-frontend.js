const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "..", "account-status-report-manager.html"),
  "utf8"
);

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<script>/)[1].trim();
const js = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)[1];

fs.mkdirSync(path.join(__dirname, "src", "styles"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "public"), { recursive: true });

fs.writeFileSync(path.join(__dirname, "src", "styles", "manager.css"), css, "utf8");
fs.writeFileSync(path.join(__dirname, "public", "asr-body.html"), body, "utf8");
fs.writeFileSync(path.join(__dirname, "public", "asr-core.js"), js, "utf8");

console.log("ok", {
  css: css.length,
  body: body.length,
  js: js.length,
  sample: body.slice(0, 100),
});
