/* SmileDesk AI — embeddable receptionist widget.
 * Usage (one line on any website):
 * <script src="https://ai-with-abdullah.github.io/smiledesk-ai/widget.js"
 *         data-id="ASSISTANT_ID" data-api="https://YOUR-WORKER.workers.dev" defer></script>
 */
(function () {
  var script = document.currentScript;
  var ID = script.getAttribute("data-id");
  var API = (script.getAttribute("data-api") || "").replace(/\/$/, "");
  if (!ID || !API) return console.warn("[SmileDesk] missing data-id or data-api");

  var cfg = null, open = false, msgs = [], busy = false;

  var css = document.createElement("style");
  css.textContent =
    ".sd-bubble{position:fixed;bottom:22px;right:22px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:99998;font-size:26px;color:#fff;display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    ".sd-bubble:hover{transform:scale(1.08)}" +
    ".sd-panel{position:fixed;bottom:94px;right:22px;width:min(370px,calc(100vw - 32px));height:min(540px,calc(100vh - 130px));background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.28);z-index:99999;display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
    ".sd-head{padding:14px 18px;color:#fff;font-weight:700;font-size:15px;display:flex;justify-content:space-between;align-items:center}" +
    ".sd-head small{display:block;font-weight:400;font-size:11px;opacity:.85}" +
    ".sd-x{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1}" +
    ".sd-body{flex:1;overflow-y:auto;padding:14px;background:#f5f7fb;display:flex;flex-direction:column;gap:8px}" +
    ".sd-m{max-width:82%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".sd-m.u{align-self:flex-end;color:#fff;border-bottom-right-radius:4px}" +
    ".sd-m.a{align-self:flex-start;background:#fff;color:#1c2733;border:1px solid #e4e9f1;border-bottom-left-radius:4px}" +
    ".sd-foot{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e9f1;background:#fff}" +
    ".sd-in{flex:1;border:1.5px solid #dbe3ee;border-radius:22px;padding:10px 14px;font-size:14px;outline:none}" +
    ".sd-send{border:none;border-radius:22px;color:#fff;font-weight:700;padding:0 18px;cursor:pointer;font-size:14px}" +
    ".sd-brand{text-align:center;font-size:10.5px;padding:5px 0 7px;background:#fff;color:#8194aa}" +
    ".sd-brand a{color:inherit;font-weight:600;text-decoration:none}";
  document.head.appendChild(css);

  fetch(API + "/api/config?id=" + encodeURIComponent(ID))
    .then(function (r) { return r.json(); })
    .then(function (c) { if (c && c.business_name) { cfg = c; mount(); } })
    .catch(function () {});

  function mount() {
    var color = cfg.color || "#1766ff";
    var bubble = document.createElement("button");
    bubble.className = "sd-bubble";
    bubble.style.background = color;
    bubble.innerHTML = "💬";
    bubble.setAttribute("aria-label", "Chat with " + cfg.business_name);
    document.body.appendChild(bubble);

    var panel = document.createElement("div");
    panel.className = "sd-panel";
    panel.style.display = "none";
    panel.innerHTML =
      '<div class="sd-head" style="background:' + color + '"><div>' + esc(cfg.business_name) +
      "<small>Virtual receptionist · replies instantly</small></div>" +
      '<button class="sd-x" aria-label="Close">×</button></div>' +
      '<div class="sd-body"></div>' +
      '<div class="sd-foot"><input class="sd-in" placeholder="Type your message…" maxlength="1000">' +
      '<button class="sd-send" style="background:' + color + '">Send</button></div>' +
      '<div class="sd-brand">⚡ Powered by <a href="https://ai-with-abdullah.github.io/smiledesk-ai/app.html" target="_blank" rel="noopener">SmileDesk AI</a> — get yours free</div>';
    document.body.appendChild(panel);

    var body = panel.querySelector(".sd-body");
    var input = panel.querySelector(".sd-in");
    var send = panel.querySelector(".sd-send");

    function add(role, text) {
      var d = document.createElement("div");
      d.className = "sd-m " + (role === "user" ? "u" : "a");
      if (role === "user") d.style.background = color;
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      return d;
    }

    function toggle() {
      open = !open;
      panel.style.display = open ? "flex" : "none";
      if (open && msgs.length === 0) {
        add("assistant", "Hi! 👋 Welcome to " + cfg.business_name + ". How can I help you today — questions or booking an appointment?");
        input.focus();
      }
    }

    function submit() {
      var text = input.value.trim();
      if (!text || busy) return;
      input.value = "";
      add("user", text);
      msgs.push({ role: "user", content: text });
      busy = true;
      var typing = add("assistant", "…");
      fetch(API + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ID, messages: msgs }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          typing.textContent = d.reply || "Sorry, please try again.";
          msgs.push({ role: "assistant", content: typing.textContent });
        })
        .catch(function () { typing.textContent = "Connection problem — please try again."; })
        .finally(function () { busy = false; });
    }

    bubble.addEventListener("click", toggle);
    panel.querySelector(".sd-x").addEventListener("click", toggle);
    send.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
