/* demo.js — Glassroom static demo dashboard
 * Pure vanilla JS. No frameworks. No build step.
 * Reads data.json, renders dashboard identical to the Flask app.
 */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────
var DONE_STATUSES = new Set(['Turned in', 'Graded', 'Done']);
var URGENT_STATUSES = new Set(['Missing']);
var ATTENTION_STATUSES = new Set(['Assigned']);

// ── State ────────────────────────────────────────────────────────────────
var allData = [];
var currentView = 'dashboard'; // 'dashboard' | 'todo'
var todoFilter = 'all'; // 'this-week' | 'next-week' | 'all' | 'overdue'

// ── Entry point ──────────────────────────────────────────────────────────
fetch('data.json')
  .then(function (r) { return r.json(); })
  .then(function (data) {
    allData = data;
    renderDashboard();
    bindNav();
  })
  .catch(function (err) {
    document.getElementById('main-content').innerHTML =
      '<div class="empty-state"><p>Failed to load demo data.</p><p>' + err + '</p></div>';
  });


// ── Navigation ───────────────────────────────────────────────────────────

function bindNav() {
  document.getElementById('nav-dashboard').addEventListener('click', function (e) {
    e.preventDefault();
    if (currentView !== 'dashboard') {
      currentView = 'dashboard';
      updateNavActive();
      renderDashboard();
    }
  });
  document.getElementById('nav-todo').addEventListener('click', function (e) {
    e.preventDefault();
    if (currentView !== 'todo') {
      currentView = 'todo';
      todoFilter = 'all';
      updateNavActive();
      renderTodo();
    }
  });
}

function updateNavActive() {
  document.getElementById('nav-dashboard').classList.toggle('active', currentView === 'dashboard');
  document.getElementById('nav-todo').classList.toggle('active', currentView === 'todo');
}


// ══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════

function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function countAttachments(links) {
  if (!links) return 0;
  return links.split('\n').filter(function (l) { return l.trim(); }).length;
}

function attachmentType(url) {
  if (!url) return 'Link';
  if (/docs\.google\.com\/document/.test(url)) return 'Doc';
  if (/docs\.google\.com\/presentation/.test(url)) return 'Slides';
  if (/docs\.google\.com\/spreadsheets/.test(url)) return 'Sheet';
  if (/docs\.google\.com\/forms/.test(url)) return 'Form';
  if (/drive\.google\.com/.test(url)) return 'Drive';
  if (/youtube\.com|youtu\.be/.test(url)) return 'Video';
  return 'Link';
}

function backPostFlag(posted, due) {
  if (!posted || !due) return '';
  if (posted > due) return 'after';
  if (posted === due) return 'same';
  return '';
}

function qualityLabel(pctDue, pctAttach, graded) {
  if (pctDue < 5 && pctAttach < 10 && graded === 0) return 'Empty';
  if (pctDue > 60 && pctAttach > 60 && graded > 0) return 'Structured';
  if (pctDue < 20 && pctAttach < 20 && graded === 0) return 'Minimal';
  return 'Partial';
}

function statusBadge(status) {
  var s = status || 'Unknown';
  var cls = {
    'Assigned': 'badge-assigned',
    'Turned in': 'badge-turned-in',
    'Graded': 'badge-graded',
    'Done': 'badge-done',
    'Missing': 'badge-missing',
    'Excused': 'badge-excused'
  }[s] || 'badge-unknown';
  return '<span class="badge ' + cls + '">' + esc(s) + '</span>';
}

function classStats(assignments) {
  var total = assignments.length;
  var done = 0, missing = 0, needsAttention = 0, graded = 0;
  var withDue = 0, withAttach = 0, attachCount = 0, backPosted = 0;

  assignments.forEach(function (a) {
    if (DONE_STATUSES.has(a.status)) done++;
    if (URGENT_STATUSES.has(a.status)) missing++;
    if (ATTENTION_STATUSES.has(a.status)) needsAttention++;
    if (a.status === 'Graded') graded++;
    if (a.due_date) withDue++;
    if (a.attachment_links) {
      withAttach++;
      attachCount += countAttachments(a.attachment_links);
    }
    if (backPostFlag(a.posted_date, a.due_date) === 'after') backPosted++;
  });

  var pctDue = total ? Math.round(100 * withDue / total) : 0;
  var pctAttach = total ? Math.round(100 * withAttach / total) : 0;
  var noDueCount = total - withDue;
  var neverGraded = total - graded;

  return {
    total: total,
    done: done,
    missing: missing,
    needs_attention: needsAttention,
    graded: graded,
    pct_due: pctDue,
    pct_attach: pctAttach,
    attach_count: attachCount,
    no_due_count: noDueCount,
    never_graded: neverGraded,
    back_posted: backPosted,
    quality_label: qualityLabel(pctDue, pctAttach, graded)
  };
}

function groupByClass(data) {
  var order = [];
  var map = {};
  data.forEach(function (a) {
    if (!map[a.class_name]) {
      map[a.class_name] = [];
      order.push(a.class_name);
    }
    map[a.class_name].push(a);
  });
  return order.map(function (name) {
    var assignments = map[name];
    // Sort: soonest due first, then posted
    assignments.sort(function (a, b) {
      var ad = a.due_date || '9999-99-99';
      var bd = b.due_date || '9999-99-99';
      if (ad !== bd) return ad < bd ? -1 : 1;
      var ap = a.posted_date || '9999-99-99';
      var bp = b.posted_date || '9999-99-99';
      return ap < bp ? -1 : ap > bp ? 1 : 0;
    });
    return { name: name, assignments: assignments, stats: classStats(assignments) };
  });
}

// Week helpers for To Do filters
function getMonday(d) {
  var dt = new Date(d);
  var day = dt.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function formatWeekRange(monday) {
  var fri = new Date(monday);
  fri.setDate(fri.getDate() + 4);
  var opts = { month: 'short', day: 'numeric' };
  return monday.toLocaleDateString('en-US', opts) + ' \u2013 ' + fri.toLocaleDateString('en-US', opts);
}


// ══════════════════════════════════════════════════════════════════════════
//  DASHBOARD VIEW
// ══════════════════════════════════════════════════════════════════════════

function renderDashboard() {
  document.getElementById('page-title').textContent = 'Dashboard';
  var classes = groupByClass(allData);
  renderStatCards(classes);
  renderDashFilterBar(classes);
  renderClassTables(classes);
}

// -- Stat cards --

function renderStatCards(classes) {
  var html = '';
  classes.forEach(function (cls) {
    var s = cls.stats;
    var tier = s.quality_label === 'Structured' ? 'stat-card-green'
             : s.quality_label === 'Partial' ? 'stat-card-amber'
             : s.quality_label === 'Empty' ? 'stat-card-dark-red'
             : 'stat-card-warn';
    var shortName = cls.name.split(' - ')[0];
    var encodedName = encodeURIComponent(cls.name);

    html += '<div class="stat-card ' + tier + '" onclick="scrollToClass(\'' + encodedName + '\')" title="Jump to ' + esc(cls.name) + '">';
    html += '<div class="stat-card-name" title="' + esc(cls.name) + '">' + esc(shortName) + '</div>';
    html += '<span class="quality-label quality-' + s.quality_label.toLowerCase() + '">' + s.quality_label + '</span>';
    html += '<div class="stat-card-numbers">';
    html += statItem(s.total, 'items', '');
    html += statItem(s.pct_due + '%', 'due dates', s.pct_due === 0 ? 'stat-zero' : '');
    html += statItem(s.no_due_count, 'no due date', s.no_due_count === 0 ? 'stat-zero' : s.no_due_count === s.total ? 'stat-missing' : 'stat-todo');
    html += statItem(s.pct_attach + '%', '% w/\u00a0attach', s.pct_attach === 0 ? 'stat-zero' : '');
    html += statItem(s.attach_count, 'attachments', s.attach_count === 0 ? 'stat-zero' : '');
    html += statItem(s.graded, 'graded', s.graded === 0 ? 'stat-zero' : 'stat-done');
    html += statItem(s.never_graded, 'never graded', s.never_graded === s.total ? 'stat-missing' : s.never_graded === 0 ? 'stat-zero' : 'stat-todo');
    html += statItem(s.missing, 'missing', s.missing > 0 ? 'stat-missing' : 'stat-zero');
    html += statItem(s.needs_attention, 'to do', s.needs_attention > 0 ? 'stat-todo' : 'stat-zero');
    if (s.back_posted > 0) {
      html += statItem(s.back_posted, 'after deadline', 'stat-missing');
    }
    html += '</div></div>';
  });
  document.getElementById('stats-row').innerHTML = html;
}

function statItem(val, label, cls) {
  return '<div class="stat-card-item ' + cls + '">'
       + '<span class="stat-card-val">' + val + '</span>'
       + '<span class="stat-card-lbl">' + label + '</span>'
       + '</div>';
}

// -- Filter bar --

function renderDashFilterBar(classes) {
  var hasBackPosted = classes.some(function (c) { return c.stats.back_posted > 0; });
  var html = '<button class="btn btn-filter active" data-filter="all" onclick="setDashFilter(\'all\')">All</button>';
  html += '<button class="btn btn-filter" data-filter="no-due" onclick="setDashFilter(\'no-due\')">No Due Date</button>';
  html += '<button class="btn btn-filter" data-filter="no-attach" onclick="setDashFilter(\'no-attach\')">No Attachments</button>';
  html += '<button class="btn btn-filter" data-filter="never-graded" onclick="setDashFilter(\'never-graded\')">Never Graded</button>';
  if (hasBackPosted) {
    html += '<button class="btn btn-filter" data-filter="back-posted" onclick="setDashFilter(\'back-posted\')">Back-posted</button>';
  }
  document.getElementById('filter-bar').innerHTML = html;
}

// -- Class tables --

function renderClassTables(classes) {
  var html = '';
  classes.forEach(function (cls, idx) {
    var s = cls.stats;
    var encodedName = encodeURIComponent(cls.name);
    html += '<details open id="' + encodedName + '" data-class-idx="' + idx + '">';
    html += '<summary><div class="card-header">';
    html += '<span class="chevron">\u25b6</span>';
    html += '<h2>' + esc(cls.name) + '</h2>';
    html += '<div class="stats">';
    html += '<span class="stat"><span class="stat-val">' + s.total + '</span> total</span>';
    html += '<span class="stat stat-missing"><span class="stat-val">' + s.missing + '</span> missing</span>';
    html += '<span class="stat stat-attention"><span class="stat-val">' + s.needs_attention + '</span> to do</span>';
    html += '<span class="stat"><span class="stat-val">' + s.done + '</span> done</span>';
    html += '<span class="stat filter-count" id="fcount-' + idx + '" style="display:none"></span>';
    html += '</div>';
    html += '<span class="spacer"></span>';
    html += '</div></summary>';
    html += '<div class="card"><div class="card-body">';

    if (cls.assignments.length) {
      html += '<table><thead><tr>';
      html += '<th>Title</th><th>Posted</th><th>Due</th><th>Status</th><th>Points</th><th>Grade</th><th>Turn in?</th><th>Attach</th>';
      html += '</tr></thead><tbody>';

      cls.assignments.forEach(function (a) {
        var attCount = countAttachments(a.attachment_links);
        var bp = backPostFlag(a.posted_date, a.due_date);

        html += '<tr class="assignment-row" data-id="' + a.id + '"'
              + ' data-no-due="' + (a.due_date ? '0' : '1') + '"'
              + ' data-no-attach="' + (a.attachment_links ? '0' : '1') + '"'
              + ' data-ungraded="' + (a.status !== 'Graded' ? '1' : '0') + '"'
              + ' data-backposted="' + bp + '">';

        // Title cell
        html += '<td>';
        html += '<a href="' + esc(a.assignment_url || '#') + '" target="_blank" rel="noopener">' + esc(a.title || '(untitled)') + '</a>';
        if (bp === 'after') html += '<span class="backpost-badge backpost-after">\u26a0 Posted after deadline</span>';
        else if (bp === 'same') html += '<span class="backpost-badge backpost-same">Posted same day as due</span>';
        html += '</td>';

        html += '<td class="nowrap">' + (a.posted_date || '\u2014') + '</td>';
        html += '<td class="nowrap">' + (a.due_date || '\u2014') + '</td>';
        html += '<td>' + statusBadge(a.status) + '</td>';
        html += '<td>' + (a.points_possible || '\u2014') + '</td>';
        html += '<td>' + (a.grade || '\u2014') + '</td>';
        html += '<td>' + (a.turn_in_required ? '<span class="turn-in-badge">yes</span>' : '') + '</td>';
        html += '<td class="nowrap">';
        if (attCount) {
          html += '<button class="attach-toggle" onclick="toggleAttach(' + a.id + ')" type="button">\ud83d\udcce ' + attCount + '</button>';
        } else {
          html += '\u2014';
        }
        html += '</td></tr>';

        // Attachment panel (hidden by default)
        if (attCount) {
          html += '<tr id="attach-panel-' + a.id + '" class="attach-panel" style="display:none"><td colspan="8"><div class="attach-list">';
          var links = (a.attachment_links || '').split('\n');
          var titles = (a.attachment_titles || '').split('\n');
          links.forEach(function (l, li) {
            if (!l.trim()) return;
            var ttl = (titles[li] || '').trim();
            html += '<div class="attach-item">';
            html += '<span class="attach-type">' + attachmentType(l) + '</span>';
            html += '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(ttl || l) + '</a>';
            html += '</div>';
          });
          html += '</div></td></tr>';
        }
      });

      html += '</tbody></table>';
    } else {
      html += '<div class="empty-state">No assignments.</div>';
    }

    html += '</div></div></details>';
  });
  document.getElementById('main-content').innerHTML = html;
}


// ══════════════════════════════════════════════════════════════════════════
//  TO DO VIEW
// ══════════════════════════════════════════════════════════════════════════

function renderTodo() {
  document.getElementById('page-title').textContent = 'To Do';
  document.getElementById('stats-row').innerHTML = '';

  // Get todo items: turn-in required, not yet submitted
  var todoItems = allData.filter(function (a) {
    return a.turn_in_required && !DONE_STATUSES.has(a.status);
  });

  renderTodoFilterBar();
  renderTodoContent(todoItems);
}

function renderTodoFilterBar() {
  var today = new Date();
  var monday = getMonday(today);
  var nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);

  var filters = [
    { key: 'this-week', label: 'This Week' },
    { key: 'next-week', label: 'Next Week' },
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' }
  ];

  var html = '';
  filters.forEach(function (f) {
    html += '<button class="btn btn-filter' + (todoFilter === f.key ? ' active' : '') + '" onclick="setTodoFilter(\'' + f.key + '\')">' + f.label + '</button>';
  });

  if (todoFilter === 'this-week') {
    html += '<span class="filter-bar-label">' + formatWeekRange(monday) + '</span>';
  } else if (todoFilter === 'next-week') {
    html += '<span class="filter-bar-label">' + formatWeekRange(nextMonday) + '</span>';
  }

  document.getElementById('filter-bar').innerHTML = html;
}

function renderTodoContent(todoItems) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var monday = getMonday(today);
  var friday = new Date(monday);
  friday.setDate(friday.getDate() + 5);
  var nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  var nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextFriday.getDate() + 5);

  // Split into items with due dates and items without
  var withDue = todoItems.filter(function (a) { return !!a.due_date; });
  var noDue = todoItems.filter(function (a) { return !a.due_date; });

  // Apply filter to items WITH due dates
  var filtered = withDue;
  if (todoFilter === 'this-week') {
    filtered = withDue.filter(function (a) {
      var d = new Date(a.due_date + 'T00:00:00');
      return d >= monday && d < friday;
    });
  } else if (todoFilter === 'next-week') {
    filtered = withDue.filter(function (a) {
      var d = new Date(a.due_date + 'T00:00:00');
      return d >= nextMonday && d < nextFriday;
    });
  } else if (todoFilter === 'overdue') {
    filtered = withDue.filter(function (a) {
      var d = new Date(a.due_date + 'T00:00:00');
      return d < today;
    });
  }

  if (filtered.length === 0 && noDue.length === 0) {
    document.getElementById('main-content').innerHTML =
      '<div class="empty-state"><p>Nothing to do! All assignments are submitted or complete.</p></div>';
    return;
  }

  var html = '';

  // Page sub-header
  html += '<div style="margin-bottom:1rem;font-size:0.85rem;color:#6B7280;">Turn-in required, not yet submitted</div>';

  // Group filtered items by class
  if (filtered.length > 0) {
    var classMap = {};
    var classOrder = [];
    filtered.forEach(function (a) {
      if (!classMap[a.class_name]) {
        classMap[a.class_name] = [];
        classOrder.push(a.class_name);
      }
      classMap[a.class_name].push(a);
    });

    classOrder.forEach(function (name) {
      html += renderTodoClassCard(name, classMap[name]);
    });
  } else if (todoFilter !== 'all') {
    html += '<div class="empty-state" style="padding:1rem 0 0.5rem"><p>No assignments match this filter.</p></div>';
  }

  // No Due Date section
  if (noDue.length > 0 && (todoFilter === 'all' || todoFilter === 'overdue')) {
    var noDueMap = {};
    var noDueOrder = [];
    noDue.forEach(function (a) {
      if (!noDueMap[a.class_name]) {
        noDueMap[a.class_name] = [];
        noDueOrder.push(a.class_name);
      }
      noDueMap[a.class_name].push(a);
    });

    html += '<div class="todo-nodue-section">';
    html += '<div class="todo-nodue-header">No Due Date</div>';
    html += '<p class="todo-nodue-sub">These assignments have no due date \u2014 they won\'t appear in week filters but always need attention.</p>';
    noDueOrder.forEach(function (name) {
      html += renderTodoClassCard(name, noDueMap[name]);
    });
    html += '</div>';
  }

  document.getElementById('main-content').innerHTML = html;
}

function renderTodoClassCard(name, assignments) {
  var html = '<div class="card" style="margin-bottom:1rem;">';
  html += '<div class="card-header card-header-static">';
  html += '<h2>' + esc(name) + '</h2>';
  html += '<span class="text-muted text-sm">' + assignments.length + ' remaining</span>';
  html += '</div><div class="card-body"><table>';
  html += '<thead><tr><th>Title</th><th>Category</th><th>Due</th><th>Status</th><th>Points</th><th>Grade</th><th>Attach</th></tr></thead>';
  html += '<tbody>';

  assignments.forEach(function (a) {
    var attCount = countAttachments(a.attachment_links);
    html += '<tr>';
    html += '<td><a href="' + esc(a.assignment_url || '#') + '" target="_blank" rel="noopener">' + esc(a.title || '(untitled)') + '</a></td>';
    html += '<td class="nowrap text-muted text-sm">' + (a.category || '\u2014') + '</td>';
    html += '<td class="nowrap">' + (a.due_date || '\u2014') + '</td>';
    html += '<td>' + statusBadge(a.status) + '</td>';
    html += '<td>' + (a.points_possible || '\u2014') + '</td>';
    html += '<td>' + (a.grade || '\u2014') + '</td>';
    html += '<td class="nowrap">';
    if (attCount) {
      html += '<button class="attach-toggle" onclick="toggleAttach(' + a.id + ')" type="button">\ud83d\udcce ' + attCount + '</button>';
    } else {
      html += '\u2014';
    }
    html += '</td></tr>';

    if (attCount) {
      html += '<tr id="attach-panel-' + a.id + '" class="attach-panel" style="display:none"><td colspan="7"><div class="attach-list">';
      var links = (a.attachment_links || '').split('\n');
      var titles = (a.attachment_titles || '').split('\n');
      links.forEach(function (l, li) {
        if (!l.trim()) return;
        var ttl = (titles[li] || '').trim();
        html += '<div class="attach-item"><span class="attach-type">' + attachmentType(l) + '</span>';
        html += '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(ttl || l) + '</a></div>';
      });
      html += '</div></td></tr>';
    }
  });

  html += '</tbody></table></div></div>';
  return html;
}


// ══════════════════════════════════════════════════════════════════════════
//  GLOBAL FUNCTIONS (called from onclick)
// ══════════════════════════════════════════════════════════════════════════

function scrollToClass(encodedName) {
  var el = document.getElementById(encodedName);
  if (el) {
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleAttach(id) {
  var panel = document.getElementById('attach-panel-' + id);
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function setDashFilter(f) {
  document.querySelectorAll('#filter-bar .btn-filter').forEach(function (b) {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  var predicates = {
    'all':           function () { return true; },
    'no-due':        function (tr) { return tr.dataset.noDue === '1'; },
    'no-attach':     function (tr) { return tr.dataset.noAttach === '1'; },
    'never-graded':  function (tr) { return tr.dataset.ungraded === '1'; },
    'back-posted':   function (tr) { return tr.dataset.backposted === 'after' || tr.dataset.backposted === 'same'; }
  };
  var test = predicates[f] || predicates['all'];
  document.querySelectorAll('details[data-class-idx]').forEach(function (det) {
    var idx = det.dataset.classIdx;
    var rows = det.querySelectorAll('tbody tr.assignment-row');
    var visible = 0;
    rows.forEach(function (tr) {
      var show = test(tr);
      tr.style.display = show ? '' : 'none';
      var panel = document.getElementById('attach-panel-' + tr.dataset.id);
      if (panel && !show) panel.style.display = 'none';
      if (show) visible++;
    });
    var countEl = document.getElementById('fcount-' + idx);
    if (countEl) {
      if (f !== 'all') {
        countEl.textContent = visible + ' of ' + rows.length + ' shown';
        countEl.style.display = '';
      } else {
        countEl.style.display = 'none';
      }
    }
    det.style.opacity = (f !== 'all' && visible === 0) ? '0.4' : '';
  });
}

function setTodoFilter(f) {
  todoFilter = f;
  renderTodo();
}
