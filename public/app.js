// Binwright client script. Everything works without it; this adds helpful touches:
// clear messages for network failures, double-submit protection, confirm prompts, printing and copying,
// and showing only the fields that matter on the record form.
(function () {
  "use strict";

  var netBox = document.getElementById("net-error");

  function showNetError(message) {
    if (!netBox) return alert(message);
    netBox.innerHTML = "";
    var div = document.createElement("div");
    div.className = "rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger";
    div.textContent = message;
    netBox.appendChild(div);
    netBox.classList.remove("hidden");
    netBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Confirm prompts on buttons with data-confirm.
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target instanceof Element ? e.target.closest("[data-confirm]") : null;
      if (el && !window.confirm(el.getAttribute("data-confirm") || "Are you sure?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  // Print and copy buttons.
  document.addEventListener("click", function (e) {
    var t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest("[data-print]")) {
      e.preventDefault();
      window.print();
      return;
    }
    var copy = t.closest("[data-copy]");
    if (copy) {
      var src = document.getElementById(copy.getAttribute("data-copy"));
      if (!src) return;
      var text = src.value || src.textContent || "";
      var done = function () {
        var old = copy.textContent;
        copy.textContent = "Copied";
        setTimeout(function () {
          copy.textContent = old;
        }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done);
    }
  });

  // Filter dropdowns that submit on change.
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t instanceof HTMLSelectElement && t.dataset.autosubmit === "1" && t.form) t.form.submit();
  });

  // Enhanced form submits: one submit at a time, and a clear message when the network fails.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-enhance")) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (form.dataset.busy === "1") return;

    var submitter = e.submitter;
    var data = new FormData(form);
    if (submitter && submitter.name) data.append(submitter.name, submitter.value);

    if (!navigator.onLine) {
      showNetError(
        "You are offline, so this was not saved. Everything you typed is still here. Try again when you have signal.",
      );
      return;
    }

    form.dataset.busy = "1";
    var buttons = form.querySelectorAll("button[type=submit], button:not([type])");
    buttons.forEach(function (b) {
      b.disabled = true;
    });
    var label = submitter ? submitter.textContent : "";
    if (submitter) submitter.textContent = "Saving...";

    function reset() {
      form.dataset.busy = "";
      buttons.forEach(function (b) {
        b.disabled = false;
      });
      if (submitter) submitter.textContent = label;
    }

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, 60000);

    var method = (form.getAttribute("method") || "post").toUpperCase();
    var action = form.getAttribute("action") || window.location.href;
    fetch(action, {
      method: method,
      body: method === "GET" ? undefined : data,
      credentials: "same-origin",
      redirect: "follow",
      signal: controller ? controller.signal : undefined,
      headers: { "X-Requested-With": "fetch" },
    })
      .then(function (res) {
        clearTimeout(timer);
        if (res.status === 413) {
          reset();
          showNetError("That form is too big to send.");
          return;
        }
        if (res.redirected) {
          window.location.assign(res.url);
          return;
        }
        return res.text().then(function (html) {
          document.open();
          document.write(html);
          document.close();
          window.scrollTo(0, 0);
        });
      })
      .catch(function () {
        clearTimeout(timer);
        reset();
        showNetError(
          "We could not reach the server, so this was not saved. Everything you typed is still here. Check your signal and try again.",
        );
      });
  });

  // ---------- Record form: show only the fields for the chosen kind of movement ----------
  var recordForm = document.querySelector("[data-record-form]");
  if (recordForm) {
    var sync = function () {
      var checked = recordForm.querySelector("input[name=type]:checked");
      var type = checked ? checked.value : "use";
      recordForm.querySelectorAll("[data-show-for]").forEach(function (el) {
        var show = el.getAttribute("data-show-for") === type;
        el.hidden = !show;
        el.querySelectorAll("input, select, textarea").forEach(function (f) {
          f.disabled = !show;
        });
      });
      var to = recordForm.querySelector("select[name=toLocationId]");
      if (to) to.required = type === "transfer";
      var note = recordForm.querySelector("textarea[name=note]");
      if (note) note.required = type === "adjust";
    };
    recordForm.addEventListener("change", function (e) {
      if (e.target instanceof HTMLInputElement && e.target.name === "type") sync();
    });
    sync();
  }
})();
