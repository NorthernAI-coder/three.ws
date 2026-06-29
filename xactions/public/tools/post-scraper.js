/*
 * XActions — Post Scraper console panel
 * A self-contained, paste-into-the-console overlay for harvesting posts from
 * the page you're looking at (X / Twitter feeds first-class, generic feeds as
 * a fallback). Monochrome by design. No dependencies, no network calls — it
 * reads the DOM you already loaded and hands you the data back as a download
 * or clipboard payload.
 *
 * Launch:  load this file in the page (see https://github.com/nirholas/XActions) or paste its
 *          contents into DevTools. Re-running toggles the panel.
 *
 * Everything lives under window.__xactionsScraper so a second run can find the
 * first instance instead of stacking duplicate panels.
 */
(function () {
  'use strict';

  // Second run while a panel already exists → just toggle it back into view.
  if (window.__xactionsScraper && window.__xactionsScraper.toggle) {
    window.__xactionsScraper.toggle();
    return;
  }

  var SETTINGS_KEY = 'xactions:scraper:settings:v1';
  var PANEL_ID = 'xactions-scraper-panel';

  /* ------------------------------------------------------------------ utils */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style') node.style.cssText = attrs[k];
        else if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function')
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function parseCount(s) {
    if (!s) return null;
    var n = String(s).replace(/[^\d.kKmM]/g, '');
    var mult = /[kK]/.test(n) ? 1e3 : /[mM]/.test(n) ? 1e6 : 1;
    var v = parseFloat(n) * mult;
    return isFinite(v) ? v : null;
  }

  // X renders counts like "1.2K" / "3,456" — normalise to an integer.
  function metricToInt(s) {
    if (!s) return 0;
    var m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KMB]?)/i);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    var u = (m[2] || '').toUpperCase();
    return Math.round(n * (u === 'K' ? 1e3 : u === 'M' ? 1e6 : u === 'B' ? 1e9 : 1));
  }

  function termsFrom(s) {
    return String(s || '')
      .split(',')
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /* -------------------------------------------------------------- settings */

  var defaults = {
    target: '',          // max posts, blank = until end of feed
    delay: 900,          // ms between scrolls
    jitter: 35,          // % random jitter on the delay (anti-cadence)
    scrollStep: 85,      // % of viewport height per scroll
    include: '',         // require at least one (or all) of these
    matchAll: false,     // include logic: ANY (false) vs ALL (true)
    avoid: '',           // drop a post if it contains any of these
    caseSensitive: false,
    regex: false,        // treat keyword terms as regular expressions
    minLikes: '',        // X only — minimum like count
    fromAuthor: '',      // only keep posts whose @handle matches (comma list)
    excludeReplies: false,
    excludeReposts: false,
    mediaOnly: false,
    dedup: true,
    idleStops: 6,        // stop after N scrolls with no new posts (end of feed)
    format: 'json'       // json | ndjson | csv | md | txt
  };

  function loadSettings() {
    try {
      var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      var out = {};
      Object.keys(defaults).forEach(function (k) {
        out[k] = raw[k] != null ? raw[k] : defaults[k];
      });
      return out;
    } catch (e) {
      return Object.assign({}, defaults);
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* --------------------------------------------------------------- adapters */

  // Each adapter knows how to find post nodes and turn one into a record.
  function makeXAdapter() {
    // X swaps the test id once the logged-in account engages: like→unlike,
    // retweet→unretweet. Match both so already-liked/reposted posts still
    // report their counts instead of falling through to 0.
    function metric(node, testid, toggled) {
      var b = node.querySelector('[data-testid="' + testid + '"]');
      if (!b && toggled) b = node.querySelector('[data-testid="' + toggled + '"]');
      if (!b) return 0;
      var label = b.getAttribute('aria-label') || b.textContent || '';
      return metricToInt(label);
    }
    return {
      name: 'X / Twitter',
      nodes: function () {
        return Array.prototype.slice.call(
          document.querySelectorAll('article[data-testid="tweet"], article[role="article"]')
        );
      },
      parse: function (node) {
        var textEl = node.querySelector('[data-testid="tweetText"]');
        var text = textEl ? textEl.innerText.trim() : '';
        var timeEl = node.querySelector('time');
        var permalink = '';
        if (timeEl && timeEl.parentElement && timeEl.parentElement.href) {
          permalink = timeEl.parentElement.href;
        } else {
          var a = node.querySelector('a[href*="/status/"]');
          if (a) permalink = a.href;
        }
        var idMatch = permalink.match(/status\/(\d+)/);
        var nameEl = node.querySelector('[data-testid="User-Name"]');
        var handle = '';
        var name = '';
        if (nameEl) {
          var handleMatch = nameEl.innerText.match(/@[\w]+/);
          handle = handleMatch ? handleMatch[0] : '';
          name = nameEl.innerText.split('\n')[0] || '';
        }
        var social = node.querySelector('[role="group"]');
        var socialLabel = social ? (social.getAttribute('aria-label') || '') : '';
        var isRepost = /reposted|retweeted/i.test(node.innerText.slice(0, 60));
        var media = Array.prototype.slice
          .call(node.querySelectorAll('[data-testid="tweetPhoto"] img, img[src*="media"]'))
          .map(function (i) { return i.src; })
          .filter(Boolean);
        var hasVideo = !!node.querySelector('[data-testid="videoPlayer"], video');
        var isReply = /replying to/i.test(node.innerText.slice(0, 80));

        return {
          id: idMatch ? idMatch[1] : (permalink || text).slice(0, 120),
          text: text,
          author: handle,
          name: name,
          permalink: permalink,
          time: timeEl ? timeEl.getAttribute('datetime') : '',
          replies: metric(node, 'reply'),
          reposts: metric(node, 'retweet', 'unretweet'),
          likes: metric(node, 'like', 'unlike'),
          views: socialLabel ? metricToInt((socialLabel.match(/([\d.,KMB]+)\s+views?/i) || [])[1]) : 0,
          media: media,
          hasVideo: hasVideo,
          isRepost: isRepost,
          isReply: isReply
        };
      }
    };
  }

  function makeGenericAdapter() {
    var sel = 'article, [role="article"], [data-testid="post"], li[role="listitem"]';
    return {
      name: 'Generic feed',
      nodes: function () {
        var nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
        // Keep only leaf-ish posts (avoid grabbing a wrapping <article>).
        return nodes.filter(function (n) {
          return !n.querySelector(sel) && (n.innerText || '').trim().length > 0;
        });
      },
      parse: function (node) {
        var text = (node.innerText || '').trim();
        var link = node.querySelector('a[href]');
        var time = node.querySelector('time');
        return {
          id: (link && link.href) || text.slice(0, 160),
          text: text,
          author: '',
          name: '',
          permalink: (link && link.href) || '',
          time: time ? (time.getAttribute('datetime') || time.textContent) : '',
          replies: 0, reposts: 0, likes: 0, views: 0,
          media: Array.prototype.slice.call(node.querySelectorAll('img'))
            .map(function (i) { return i.src; }).filter(Boolean),
          hasVideo: !!node.querySelector('video'),
          isRepost: false, isReply: false
        };
      }
    };
  }

  function pickAdapter() {
    var h = location.hostname;
    if (/(^|\.)x\.com$/.test(h) || /(^|\.)twitter\.com$/.test(h)) return makeXAdapter();
    return makeGenericAdapter();
  }

  /* ---------------------------------------------------------------- filters */

  function buildMatchers(settings) {
    var flags = settings.caseSensitive ? '' : 'i';
    function compile(list) {
      return list.map(function (t) {
        if (settings.regex) {
          try { return new RegExp(t, flags); } catch (e) { return null; }
        }
        return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      }).filter(Boolean);
    }
    return {
      include: compile(termsFrom(settings.include)),
      avoid: compile(termsFrom(settings.avoid))
    };
  }

  function passesFilters(rec, settings, matchers) {
    var text = rec.text || '';
    if (matchers.avoid.length && matchers.avoid.some(function (r) { return r.test(text); }))
      return 'avoided';
    if (matchers.include.length) {
      var fn = settings.matchAll ? 'every' : 'some';
      if (!matchers.include[fn](function (r) { return r.test(text); })) return 'no-keyword';
    }
    if (settings.excludeReplies && rec.isReply) return 'reply';
    if (settings.excludeReposts && rec.isRepost) return 'repost';
    if (settings.mediaOnly && !(rec.media.length || rec.hasVideo)) return 'no-media';
    var minLikes = parseCount(settings.minLikes);
    if (minLikes != null && rec.likes < minLikes) return 'low-likes';
    var authors = termsFrom(settings.fromAuthor).map(function (a) {
      return a.replace(/^@/, '').toLowerCase();
    });
    if (authors.length) {
      var h = (rec.author || '').replace(/^@/, '').toLowerCase();
      if (authors.indexOf(h) === -1) return 'author';
    }
    return null; // passes
  }

  /* ----------------------------------------------------------------- export */

  function exportData(records, format) {
    var rows = records.slice();
    var content, mime, ext;
    if (format === 'csv') {
      var cols = ['id', 'author', 'name', 'time', 'text', 'likes', 'reposts', 'replies', 'views', 'permalink', 'media'];
      var lines = [cols.join(',')];
      rows.forEach(function (r) {
        lines.push(cols.map(function (c) {
          return csvCell(c === 'media' ? (r.media || []).join(' ') : r[c]);
        }).join(','));
      });
      content = lines.join('\n'); mime = 'text/csv'; ext = 'csv';
    } else if (format === 'ndjson') {
      content = rows.map(function (r) { return JSON.stringify(r); }).join('\n');
      mime = 'application/x-ndjson'; ext = 'ndjson';
    } else if (format === 'md') {
      content = rows.map(function (r) {
        var head = (r.name || r.author || 'Post') + (r.author ? ' (' + r.author + ')' : '');
        var meta = [r.time, r.likes ? r.likes + ' likes' : '', r.permalink].filter(Boolean).join(' · ');
        return '### ' + head + '\n\n' + (r.text || '') + '\n\n' + (meta ? '> ' + meta + '\n' : '');
      }).join('\n---\n\n');
      mime = 'text/markdown'; ext = 'md';
    } else if (format === 'txt') {
      content = rows.map(function (r) { return r.text || ''; }).join('\n\n----\n\n');
      mime = 'text/plain'; ext = 'txt';
    } else {
      content = JSON.stringify({
        source: location.href,
        scrapedAt: new Date().toISOString(),
        count: rows.length,
        posts: rows
      }, null, 2);
      mime = 'application/json'; ext = 'json';
    }
    return { content: content, mime: mime, ext: ext };
  }

  function download(payload) {
    var blob = new Blob([payload.content], { type: payload.mime });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    var a = el('a', { href: url, download: 'posts-' + stamp + '.' + payload.ext });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* -------------------------------------------------------------------- UI */

  var settings = loadSettings();
  var adapter = pickAdapter();

  var state = {
    running: false,
    paused: false,
    stopRequested: false,
    collected: new Map(),
    scrolls: 0,
    idle: 0,
    skipped: { dupe: 0, filtered: 0 }
  };

  var refs = {};

  function injectStyles() {
    if (document.getElementById(PANEL_ID + '-css')) return;
    var css = [
      '#' + PANEL_ID + '{position:fixed;top:16px;right:16px;width:330px;z-index:2147483647;',
      'background:#000;color:#fff;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
      'border:1px solid #2a2a2a;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.6);',
      'user-select:none;overflow:hidden;letter-spacing:.2px}',
      '#' + PANEL_ID + ' *{box-sizing:border-box}',
      '#' + PANEL_ID + ' .tws-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;',
      'cursor:grab;background:#0a0a0a;border-bottom:1px solid #1c1c1c}',
      '#' + PANEL_ID + ' .tws-hd:active{cursor:grabbing}',
      '#' + PANEL_ID + ' .tws-dot{width:7px;height:7px;border-radius:50%;background:#444;flex:0 0 auto;',
      'transition:background .2s,box-shadow .2s}',
      '#' + PANEL_ID + ' .tws-dot.on{background:#fff;box-shadow:0 0 8px #fff}',
      '#' + PANEL_ID + ' .tws-dot.pause{background:#888}',
      '#' + PANEL_ID + ' .tws-ttl{font-weight:600;letter-spacing:.5px;flex:1}',
      '#' + PANEL_ID + ' .tws-src{color:#666;font-size:10px}',
      '#' + PANEL_ID + ' .tws-ico{cursor:pointer;color:#888;padding:2px 6px;border-radius:6px;font-size:13px}',
      '#' + PANEL_ID + ' .tws-ico:hover{color:#fff;background:#1c1c1c}',
      '#' + PANEL_ID + ' .tws-bd{padding:12px;max-height:72vh;overflow:auto}',
      '#' + PANEL_ID + ' .tws-bd::-webkit-scrollbar{width:8px}',
      '#' + PANEL_ID + ' .tws-bd::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:4px}',
      '#' + PANEL_ID + ' label{display:block;color:#888;margin:10px 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:.6px}',
      '#' + PANEL_ID + ' .tws-row{display:flex;gap:8px}',
      '#' + PANEL_ID + ' .tws-row>div{flex:1}',
      '#' + PANEL_ID + ' input[type=text],#' + PANEL_ID + ' input[type=number],#' + PANEL_ID + ' select{',
      'width:100%;background:#111;color:#fff;border:1px solid #2a2a2a;border-radius:7px;padding:7px 8px;',
      'font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}',
      '#' + PANEL_ID + ' input:focus,#' + PANEL_ID + ' select:focus{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.15)}',
      '#' + PANEL_ID + ' input::placeholder{color:#555}',
      '#' + PANEL_ID + ' .tws-chk{display:flex;align-items:center;gap:7px;color:#ccc;margin:7px 0;',
      'text-transform:none;letter-spacing:0;font-size:11px;cursor:pointer}',
      '#' + PANEL_ID + ' .tws-chk input{accent-color:#fff;width:13px;height:13px;cursor:pointer}',
      '#' + PANEL_ID + ' .tws-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}',
      '#' + PANEL_ID + ' .tws-btns{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:14px}',
      '#' + PANEL_ID + ' button{font:inherit;cursor:pointer;border-radius:8px;padding:9px;border:1px solid #2a2a2a;',
      'background:#111;color:#fff;transition:all .15s;letter-spacing:.3px}',
      '#' + PANEL_ID + ' button:hover{border-color:#555;background:#181818}',
      '#' + PANEL_ID + ' button:active{transform:translateY(1px)}',
      '#' + PANEL_ID + ' button:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(255,255,255,.3)}',
      '#' + PANEL_ID + ' button:disabled{opacity:.35;cursor:not-allowed}',
      '#' + PANEL_ID + ' button.tws-primary{background:#fff;color:#000;border-color:#fff;font-weight:600;grid-column:1/-1}',
      '#' + PANEL_ID + ' button.tws-primary:hover{background:#ddd}',
      '#' + PANEL_ID + ' .tws-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0 4px}',
      '#' + PANEL_ID + ' .tws-stat{background:#0c0c0c;border:1px solid #1c1c1c;border-radius:8px;padding:8px 6px;text-align:center}',
      '#' + PANEL_ID + ' .tws-stat b{display:block;font-size:17px;font-weight:600}',
      '#' + PANEL_ID + ' .tws-stat span{color:#666;font-size:9px;text-transform:uppercase;letter-spacing:.5px}',
      '#' + PANEL_ID + ' .tws-bar{height:4px;background:#1c1c1c;border-radius:2px;overflow:hidden;margin:10px 0 6px}',
      '#' + PANEL_ID + ' .tws-bar i{display:block;height:100%;width:0;background:#fff;transition:width .25s}',
      '#' + PANEL_ID + ' .tws-status{color:#888;font-size:10px;min-height:13px;text-align:center}',
      '#' + PANEL_ID + ' .tws-adv-t{color:#666;cursor:pointer;margin-top:12px;font-size:10px;text-transform:uppercase;letter-spacing:.6px}',
      '#' + PANEL_ID + ' .tws-adv-t:hover{color:#aaa}',
      '#' + PANEL_ID + ' .tws-adv{display:none}',
      '#' + PANEL_ID + ' .tws-adv.open{display:block}',
      '#' + PANEL_ID + '.tws-collapsed .tws-bd{display:none}'
    ].join('');
    document.head.appendChild(el('style', { id: PANEL_ID + '-css', text: css }));
  }

  function field(label, key, type, attrs) {
    var input = el('input', Object.assign({ type: type || 'text', value: settings[key] }, attrs || {}));
    input.addEventListener('input', function () {
      settings[key] = input.value;
      saveSettings(settings);
    });
    refs[key] = input;
    return el('div', null, [el('label', { text: label }), input]);
  }

  function checkbox(label, key) {
    var input = el('input', { type: 'checkbox' });
    input.checked = !!settings[key];
    input.addEventListener('change', function () {
      settings[key] = input.checked;
      saveSettings(settings);
    });
    refs[key] = input;
    return el('label', { class: 'tws-chk' }, [input, label]);
  }

  function buildPanel() {
    injectStyles();

    var fmt = el('select', null, [
      el('option', { value: 'json', text: 'JSON' }),
      el('option', { value: 'ndjson', text: 'NDJSON (1/line)' }),
      el('option', { value: 'csv', text: 'CSV (spreadsheet)' }),
      el('option', { value: 'md', text: 'Markdown' }),
      el('option', { value: 'txt', text: 'Plain text' })
    ]);
    fmt.value = settings.format;
    fmt.addEventListener('change', function () { settings.format = fmt.value; saveSettings(settings); });
    refs.format = fmt;

    refs.dot = el('span', { class: 'tws-dot' });
    refs.startBtn = el('button', { class: 'tws-primary', text: 'Start scraping', onclick: onStart });
    refs.pauseBtn = el('button', { text: 'Pause', disabled: 'true', onclick: onPauseResume });
    refs.stopBtn = el('button', { text: 'Stop', disabled: 'true', onclick: onStop });
    refs.exportBtn = el('button', { text: 'Export', disabled: 'true', onclick: onExport });
    refs.copyBtn = el('button', { text: 'Copy', disabled: 'true', onclick: onCopy });
    refs.clearBtn = el('button', { text: 'Clear', disabled: 'true', onclick: onClear });

    refs.nScraped = el('b', { text: '0' });
    refs.nScrolls = el('b', { text: '0' });
    refs.nSkipped = el('b', { text: '0' });
    refs.barFill = el('i');
    refs.status = el('div', { class: 'tws-status', text: 'Ready · ' + adapter.name + ' detected' });

    var advBody = el('div', { class: 'tws-adv' }, [
      el('div', { class: 'tws-grid2' }, [
        field('Scroll delay (ms)', 'delay', 'number', { min: '120', step: '50' }),
        field('Jitter (%)', 'jitter', 'number', { min: '0', max: '90' }),
        field('Scroll step (%vh)', 'scrollStep', 'number', { min: '20', max: '100' }),
        field('Stop after N idle', 'idleStops', 'number', { min: '1', max: '40' })
      ]),
      field('Only from authors (@a, @b)', 'fromAuthor', 'text', { placeholder: 'any author' }),
      field('Min likes (X only)', 'minLikes', 'text', { placeholder: 'no minimum' }),
      el('div', { class: 'tws-grid2' }, [
        checkbox('Match ALL keywords', 'matchAll'),
        checkbox('Case sensitive', 'caseSensitive'),
        checkbox('Regex terms', 'regex'),
        checkbox('De-duplicate', 'dedup'),
        checkbox('Skip replies', 'excludeReplies'),
        checkbox('Skip reposts', 'excludeReposts'),
        checkbox('Media only', 'mediaOnly')
      ])
    ]);
    refs.adv = advBody;

    var advToggle = el('div', {
      class: 'tws-adv-t',
      text: '▸ Advanced filters & timing',
      onclick: function () {
        advBody.classList.toggle('open');
        advToggle.textContent = (advBody.classList.contains('open') ? '▾' : '▸') + ' Advanced filters & timing';
      }
    });

    var body = el('div', { class: 'tws-bd' }, [
      el('div', { class: 'tws-row' }, [
        field('How many posts', 'target', 'text', { placeholder: 'all (until feed end)' })
      ]),
      field('Look for keywords (a, b, c)', 'include', 'text', { placeholder: 'any text' }),
      field('Avoid keywords (x, y, z)', 'avoid', 'text', { placeholder: 'none' }),
      el('div', null, [el('label', { text: 'Export format' }), fmt]),
      advToggle,
      advBody,
      el('div', { class: 'tws-bar' }, [refs.barFill]),
      el('div', { class: 'tws-stats' }, [
        el('div', { class: 'tws-stat' }, [refs.nScraped, el('span', { text: 'scraped' })]),
        el('div', { class: 'tws-stat' }, [refs.nScrolls, el('span', { text: 'scrolls' })]),
        el('div', { class: 'tws-stat' }, [refs.nSkipped, el('span', { text: 'skipped' })])
      ]),
      refs.status,
      el('div', { class: 'tws-btns' }, [
        refs.startBtn,
        refs.pauseBtn, refs.stopBtn,
        refs.exportBtn, refs.copyBtn,
        refs.clearBtn
      ])
    ]);

    var collapseBtn = el('span', { class: 'tws-ico', title: 'Collapse', text: '–' });
    var closeBtn = el('span', { class: 'tws-ico', title: 'Close (re-run to reopen)', text: '✕' });

    var header = el('div', { class: 'tws-hd' }, [
      refs.dot,
      el('span', { class: 'tws-ttl', text: 'POST SCRAPER' }),
      el('span', { class: 'tws-src', text: 'XActions' }),
      collapseBtn,
      closeBtn
    ]);

    var panel = el('div', { id: PANEL_ID, role: 'dialog', 'aria-label': 'XActions post scraper' }, [header, body]);

    collapseBtn.addEventListener('click', function () {
      panel.classList.toggle('tws-collapsed');
      collapseBtn.textContent = panel.classList.contains('tws-collapsed') ? '+' : '–';
    });
    closeBtn.addEventListener('click', function () { api.toggle(); });

    makeDraggable(panel, header);
    document.body.appendChild(panel);
    refs.panel = panel;
  }

  function makeDraggable(panel, handle) {
    var sx, sy, ox, oy, dragging = false;
    handle.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('tws-ico')) return;
      dragging = true;
      var r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      panel.style.right = 'auto';
      panel.style.left = ox + 'px';
      panel.style.top = oy + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var nx = clamp(ox + e.clientX - sx, 0, window.innerWidth - 80);
      var ny = clamp(oy + e.clientY - sy, 0, window.innerHeight - 30);
      panel.style.left = nx + 'px';
      panel.style.top = ny + 'px';
    });
    window.addEventListener('mouseup', function () { dragging = false; });
  }

  /* ------------------------------------------------------------- run loop */

  function setStatus(msg) { if (refs.status) refs.status.textContent = msg; }

  function render() {
    var n = state.collected.size;
    refs.nScraped.textContent = n;
    refs.nScrolls.textContent = state.scrolls;
    refs.nSkipped.textContent = state.skipped.dupe + state.skipped.filtered;
    var target = parseCount(settings.target);
    refs.barFill.style.width = target ? clamp((n / target) * 100, 0, 100) + '%'
      : (state.running ? Math.min(95, state.scrolls * 4) + '%' : (n ? '100%' : '0%'));
    var has = n > 0;
    refs.exportBtn.disabled = !has;
    refs.copyBtn.disabled = !has;
    refs.clearBtn.disabled = !has || state.running;
  }

  function harvest(matchers) {
    var target = parseCount(settings.target);
    var before = state.collected.size;
    var nodes = adapter.nodes();
    for (var i = 0; i < nodes.length; i++) {
      if (target && state.collected.size >= target) break;
      var rec;
      try { rec = adapter.parse(nodes[i]); } catch (e) { continue; }
      if (!rec || !rec.text) continue;
      var key = settings.dedup ? rec.id : rec.id + ':' + state.collected.size;
      if (settings.dedup && state.collected.has(key)) { state.skipped.dupe++; continue; }
      var verdict = passesFilters(rec, settings, matchers);
      if (verdict) { state.skipped.filtered++; continue; }
      state.collected.set(key, rec);
    }
    return state.collected.size - before;
  }

  async function runLoop() {
    var matchers = buildMatchers(settings);
    var target = parseCount(settings.target);
    state.idle = 0;
    harvest(matchers); // grab what's already on screen
    render();

    while (state.running && !state.stopRequested) {
      while (state.paused && !state.stopRequested) { await sleep(150); }
      if (state.stopRequested) break;
      if (target && state.collected.size >= target) { setStatus('Target reached — ' + target + ' posts'); break; }

      var step = window.innerHeight * (clamp(parseFloat(settings.scrollStep) || 85, 20, 100) / 100);
      window.scrollBy(0, step);
      state.scrolls++;

      var base = clamp(parseFloat(settings.delay) || 900, 120, 60000);
      var j = clamp(parseFloat(settings.jitter) || 0, 0, 90) / 100;
      var wait = base * (1 + (Math.random() * 2 - 1) * j);
      setStatus('Scrolling… ' + state.collected.size + ' posts so far');
      await sleep(wait);

      var added = harvest(matchers);
      render();

      if (added === 0) {
        state.idle++;
        var limit = clamp(parseFloat(settings.idleStops) || 6, 1, 40);
        setStatus('No new posts (' + state.idle + '/' + limit + ' before stop)');
        if (state.idle >= limit) { setStatus('Reached end of feed — ' + state.collected.size + ' posts'); break; }
      } else {
        state.idle = 0;
      }
    }
    finishRun();
  }

  function finishRun() {
    state.running = false;
    state.paused = false;
    state.stopRequested = false;
    refs.dot.className = 'tws-dot';
    refs.startBtn.disabled = false;
    refs.startBtn.textContent = state.collected.size ? 'Scrape more' : 'Start scraping';
    refs.pauseBtn.disabled = true;
    refs.pauseBtn.textContent = 'Pause';
    refs.stopBtn.disabled = true;
    [refs.target, refs.include, refs.avoid].forEach(function (i) { if (i) i.disabled = false; });
    if (!state.collected.size) setStatus('No posts matched — adjust filters and retry');
    render();
  }

  function onStart() {
    if (state.running) return;
    state.running = true;
    state.paused = false;
    state.stopRequested = false;
    state.scrolls = 0;
    refs.dot.className = 'tws-dot on';
    refs.startBtn.disabled = true;
    refs.pauseBtn.disabled = false;
    refs.stopBtn.disabled = false;
    refs.clearBtn.disabled = true;
    setStatus('Starting…');
    runLoop();
  }

  function onPauseResume() {
    if (!state.running) return;
    state.paused = !state.paused;
    refs.pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    refs.dot.className = 'tws-dot ' + (state.paused ? 'pause' : 'on');
    setStatus(state.paused ? 'Paused — ' + state.collected.size + ' posts held' : 'Resuming…');
  }

  function onStop() {
    if (!state.running) return;
    state.stopRequested = true;
    state.paused = false;
    setStatus('Stopping…');
  }

  function records() {
    return Array.from(state.collected.values());
  }

  function onExport() {
    if (!state.collected.size) return;
    download(exportData(records(), settings.format));
    setStatus('Exported ' + state.collected.size + ' posts as ' + settings.format.toUpperCase());
  }

  async function onCopy() {
    if (!state.collected.size) return;
    var payload = exportData(records(), settings.format);
    try {
      await navigator.clipboard.writeText(payload.content);
      setStatus('Copied ' + state.collected.size + ' posts to clipboard');
    } catch (e) {
      // Clipboard API needs focus/permission — fall back to a download.
      download(payload);
      setStatus('Clipboard blocked — downloaded instead');
    }
  }

  function onClear() {
    if (state.running) return;
    state.collected.clear();
    state.scrolls = 0;
    state.skipped = { dupe: 0, filtered: 0 };
    render();
    refs.startBtn.textContent = 'Start scraping';
    setStatus('Cleared');
  }

  /* ------------------------------------------------------------------- api */

  var api = {
    toggle: function () {
      var existing = document.getElementById(PANEL_ID);
      if (existing) {
        existing.remove();
      } else {
        buildPanel();
        render();
      }
    },
    get data() { return records(); },
    export: onExport,
    stop: onStop
  };

  window.__xactionsScraper = api;
  buildPanel();
  render();
})();
