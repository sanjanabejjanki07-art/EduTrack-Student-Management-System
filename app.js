/* ==========================================================================
   EduTrack - Student Management System
   Vanilla JS: CRUD, search, filter, sort, pagination, validation,
   charts, CSV export, dark mode, localStorage persistence.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- Constants ---------- */
  const STORAGE_KEY = "edutrack_students_v1";
  const THEME_KEY = "edutrack_theme";
  const PER_PAGE = 6;
  const STATUS_COLORS = { Active: "#16a34a", Inactive: "#94a3b8", Graduated: "#d97706" };
  const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];

  const SEED = [
    { name: "Ananya Reddy", email: "ananya.reddy@example.com", phone: "9876543210", course: "Computer Science", year: 3, gpa: 9.1, status: "Active" },
    { name: "Rohit Sharma", email: "rohit.sharma@example.com", phone: "9123456780", course: "Mechanical", year: 2, gpa: 7.4, status: "Active" },
    { name: "Priya Nair", email: "priya.nair@example.com", phone: "9988776655", course: "Electronics", year: 4, gpa: 8.6, status: "Graduated" },
    { name: "Karthik Rao", email: "karthik.rao@example.com", phone: "9090909090", course: "Computer Science", year: 1, gpa: 8.2, status: "Active" },
    { name: "Sneha Patel", email: "sneha.patel@example.com", phone: "9811122233", course: "Business Administration", year: 2, gpa: 6.8, status: "Inactive" },
    { name: "Arjun Mehta", email: "arjun.mehta@example.com", phone: "9700011122", course: "Civil", year: 3, gpa: 7.9, status: "Active" },
    { name: "Divya Kumar", email: "divya.kumar@example.com", phone: "9666655544", course: "Computer Science", year: 4, gpa: 9.4, status: "Graduated" },
    { name: "Vikram Singh", email: "vikram.singh@example.com", phone: "9555544433", course: "Electronics", year: 1, gpa: 5.9, status: "Active" },
    { name: "Meera Iyer", email: "meera.iyer@example.com", phone: "9444433322", course: "Business Administration", year: 3, gpa: 8.8, status: "Active" },
    { name: "Sai Teja", email: "sai.teja@example.com", phone: "9333322211", course: "Mechanical", year: 4, gpa: 7.1, status: "Graduated" }
  ];

  /* ---------- State ---------- */
  const state = {
    students: [],
    query: "",
    course: "all",
    status: "all",
    sort: "name-asc",
    page: 1,
    editingId: null,
    deleteId: null
  };

  /* ---------- DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const els = {
    body: $("#studentBody"),
    empty: $("#emptyState"),
    table: $("#studentTable"),
    search: $("#searchInput"),
    courseFilter: $("#courseFilter"),
    statusFilter: $("#statusFilter"),
    sortSelect: $("#sortSelect"),
    resultInfo: $("#resultInfo"),
    pageInfo: $("#pageInfo"),
    prev: $("#prevBtn"),
    next: $("#nextBtn"),
    dialog: $("#studentDialog"),
    form: $("#studentForm"),
    dialogTitle: $("#dialogTitle"),
    confirmDialog: $("#confirmDialog"),
    confirmText: $("#confirmText"),
    toastRegion: $("#toastRegion"),
    themeIcon: $("#themeIcon")
  };

  /* ---------- Utilities ---------- */
  const escapeHTML = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const initials = (name) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

  const colorFor = (name) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };

  const generateId = () => {
    const nums = state.students.map((s) => parseInt(s.id.replace(/\D/g, ""), 10) || 0);
    const next = (nums.length ? Math.max(...nums) : 1000) + 1;
    return "STU" + next;
  };

  const debounce = (fn, wait = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  const gpaClass = (g) => (g >= 8 ? "gpa--high" : g >= 6.5 ? "gpa--mid" : "gpa--low");

  /* ---------- Storage ---------- */
  function buildSeed() {
    const base = Date.now() - SEED.length * 86400000;
    return SEED.map((s, i) => ({ ...s, id: "STU" + (1001 + i), createdAt: base + i * 86400000 }));
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn("Could not read saved data, using demo data.", err);
    }
    return buildSeed();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.students));
    } catch (err) {
      toast("Could not save data (storage unavailable).", true);
    }
  }

  /* ---------- Filtering / sorting ---------- */
  function getFiltered() {
    const q = state.query.trim().toLowerCase();
    let list = state.students.filter((s) => {
      const matchQ = !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const matchC = state.course === "all" || s.course === state.course;
      const matchS = state.status === "all" || s.status === state.status;
      return matchQ && matchC && matchS;
    });

    const sorters = {
      "name-asc": (a, b) => a.name.localeCompare(b.name),
      "name-desc": (a, b) => b.name.localeCompare(a.name),
      "gpa-desc": (a, b) => b.gpa - a.gpa,
      "gpa-asc": (a, b) => a.gpa - b.gpa,
      newest: (a, b) => b.createdAt - a.createdAt
    };
    return list.sort(sorters[state.sort]);
  }

  /* ---------- Rendering ---------- */
  function render() {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * PER_PAGE;
    const pageItems = filtered.slice(start, start + PER_PAGE);

    renderRows(pageItems);
    renderPagination(filtered.length, start, pageItems.length, totalPages);
    renderStats();
    renderCharts();
    renderCourseFilter();
  }

  function renderRows(items) {
    const hasItems = items.length > 0;
    els.empty.hidden = hasItems;
    els.table.hidden = !hasItems;

    els.body.innerHTML = items
      .map(
        (s) => `
        <tr data-id="${escapeHTML(s.id)}">
          <td class="td-student" data-label="Student">
            <div class="student">
              <span class="avatar" style="background:${colorFor(s.name)}" aria-hidden="true">${escapeHTML(initials(s.name))}</span>
              <div>
                <div class="student__name">${escapeHTML(s.name)}</div>
                <div class="student__email">${escapeHTML(s.email)}</div>
              </div>
            </div>
          </td>
          <td data-label="ID" class="mono">${escapeHTML(s.id)}</td>
          <td data-label="Course">${escapeHTML(s.course)}</td>
          <td data-label="Year">Year ${escapeHTML(s.year)}</td>
          <td data-label="GPA"><span class="gpa ${gpaClass(s.gpa)}">${Number(s.gpa).toFixed(2)}</span></td>
          <td data-label="Status"><span class="badge badge--${escapeHTML(s.status)}">${escapeHTML(s.status)}</span></td>
          <td class="td-actions" data-label="Actions">
            <div class="row-actions">
              <button class="row-btn" data-action="edit" type="button" aria-label="Edit ${escapeHTML(s.name)}">Edit</button>
              <button class="row-btn row-btn--danger" data-action="delete" type="button" aria-label="Delete ${escapeHTML(s.name)}">Delete</button>
            </div>
          </td>
        </tr>`
      )
      .join("");
  }

  function renderPagination(total, start, shown, totalPages) {
    els.resultInfo.textContent = total
      ? `Showing ${start + 1}–${start + shown} of ${total} student${total === 1 ? "" : "s"}`
      : "No results";
    els.pageInfo.textContent = `${state.page} / ${totalPages}`;
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= totalPages;
  }

  function renderStats() {
    const list = state.students;
    const count = (st) => list.filter((s) => s.status === st).length;
    const avg = list.length ? list.reduce((sum, s) => sum + Number(s.gpa), 0) / list.length : 0;
    $("#statTotal").textContent = list.length;
    $("#statActive").textContent = count("Active");
    $("#statGraduated").textContent = count("Graduated");
    $("#statGpa").textContent = avg.toFixed(2);
  }

  function renderCharts() {
    const list = state.students;

    // Bar chart: students per course
    const byCourse = list.reduce((acc, s) => ((acc[s.course] = (acc[s.course] || 0) + 1), acc), {});
    const entries = Object.entries(byCourse).sort((a, b) => b[1] - a[1]);
    const max = entries.length ? entries[0][1] : 1;
    const chart = $("#courseChart");
    chart.innerHTML = entries.length
      ? entries
          .map(
            ([course, n]) => `
            <div class="bar__row">
              <span>${escapeHTML(course)}</span>
              <div class="bar__track"><div class="bar__fill" data-w="${(n / max) * 100}"></div></div>
              <span class="bar__count">${n}</span>
            </div>`
          )
          .join("")
      : '<p class="muted">No data yet.</p>';
    requestAnimationFrame(() => {
      chart.querySelectorAll(".bar__fill").forEach((el) => (el.style.width = el.dataset.w + "%"));
    });

    // Donut: status distribution (conic-gradient)
    const statuses = ["Active", "Inactive", "Graduated"];
    const total = list.length;
    let acc = 0;
    const stops = statuses.map((st) => {
      const n = list.filter((s) => s.status === st).length;
      const from = total ? (acc / total) * 100 : 0;
      acc += n;
      const to = total ? (acc / total) * 100 : 0;
      return { st, n, css: `${STATUS_COLORS[st]} ${from}% ${to}%` };
    });
    const donut = $("#donut");
    donut.style.background = total ? `conic-gradient(${stops.map((s) => s.css).join(", ")})` : "";
    $("#donutCenter").textContent = total;
    $("#donutLegend").innerHTML = stops
      .map((s) => `<li><i style="background:${STATUS_COLORS[s.st]}"></i>${s.st} <strong>${s.n}</strong></li>`)
      .join("");
  }

  function renderCourseFilter() {
    const courses = [...new Set(state.students.map((s) => s.course))].sort();
    const current = state.course;
    els.courseFilter.innerHTML =
      '<option value="all">All courses</option>' +
      courses.map((c) => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("");
    els.courseFilter.value = courses.includes(current) ? current : "all";
    if (!courses.includes(current)) state.course = "all";
  }

  /* ---------- Toast ---------- */
  function toast(message, isError = false) {
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " toast--error" : "");
    el.textContent = message;
    els.toastRegion.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ---------- Validation ---------- */
  const validators = {
    name: (v) => (v.trim().length < 3 ? "Name must be at least 3 characters." : /^[A-Za-z .'-]+$/.test(v.trim()) ? "" : "Use letters only."),
    email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? "" : "Enter a valid email address."),
    phone: (v) => (/^[6-9]\d{9}$/.test(v.trim()) ? "" : "Enter a valid 10-digit mobile number."),
    course: (v) => (v ? "" : "Please select a course."),
    year: (v) => (v ? "" : "Please select a year."),
    gpa: (v) => {
      const n = parseFloat(v);
      return v !== "" && !isNaN(n) && n >= 0 && n <= 10 ? "" : "GPA must be between 0 and 10.";
    },
    status: (v) => (v ? "" : "Please select a status.")
  };

  function setFieldError(name, message) {
    const group = els.form.elements[name].closest(".form-group");
    group.classList.toggle("invalid", Boolean(message));
    $(`[data-error-for="${name}"]`).textContent = message;
  }

  function validateField(name) {
    const msg = validators[name](els.form.elements[name].value);
    // Duplicate email check
    if (!msg && name === "email") {
      const email = els.form.elements.email.value.trim().toLowerCase();
      const dup = state.students.some((s) => s.email.toLowerCase() === email && s.id !== state.editingId);
      if (dup) {
        setFieldError(name, "This email is already registered.");
        return false;
      }
    }
    setFieldError(name, msg);
    return !msg;
  }

  function validateForm() {
    return Object.keys(validators).map(validateField).every(Boolean);
  }

  /* ---------- Dialog actions ---------- */
  function openForm(id = null) {
    state.editingId = id;
    els.form.reset();
    Object.keys(validators).forEach((n) => setFieldError(n, ""));

    if (id) {
      const s = state.students.find((x) => x.id === id);
      if (!s) return;
      els.dialogTitle.textContent = "Edit Student";
      ["name", "email", "phone", "course", "year", "gpa", "status"].forEach((k) => (els.form.elements[k].value = s[k]));
    } else {
      els.dialogTitle.textContent = "Add Student";
      els.form.elements.status.value = "Active";
    }
    els.dialog.showModal();
    els.form.elements.name.focus();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) {
      toast("Please fix the highlighted fields.", true);
      return;
    }
    const f = els.form.elements;
    const data = {
      name: f.name.value.trim().replace(/\s+/g, " "),
      email: f.email.value.trim().toLowerCase(),
      phone: f.phone.value.trim(),
      course: f.course.value,
      year: Number(f.year.value),
      gpa: Math.round(parseFloat(f.gpa.value) * 100) / 100,
      status: f.status.value
    };

    if (state.editingId) {
      const i = state.students.findIndex((s) => s.id === state.editingId);
      state.students[i] = { ...state.students[i], ...data };
      toast("Student updated successfully.");
    } else {
      state.students.push({ ...data, id: generateId(), createdAt: Date.now() });
      state.sort = "newest";
      els.sortSelect.value = "newest";
      state.page = 1;
      toast("Student added successfully.");
    }
    save();
    els.dialog.close();
    render();
  }

  function askDelete(id) {
    const s = state.students.find((x) => x.id === id);
    if (!s) return;
    state.deleteId = id;
    els.confirmText.textContent = `${s.name} (${s.id}) will be permanently removed. This cannot be undone.`;
    els.confirmDialog.showModal();
  }

  function confirmDelete() {
    state.students = state.students.filter((s) => s.id !== state.deleteId);
    state.deleteId = null;
    save();
    els.confirmDialog.close();
    render();
    toast("Student deleted.");
  }

  /* ---------- CSV export ---------- */
  function exportCSV() {
    const rows = getFiltered();
    if (!rows.length) return toast("Nothing to export.", true);
    const header = ["ID", "Name", "Email", "Phone", "Course", "Year", "GPA", "Status"];
    const cell = (v) => {
      let s = String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // guard against CSV formula injection
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [header.join(",")].concat(
      rows.map((s) => [s.id, s.name, s.email, s.phone, s.course, s.year, s.gpa, s.status].map(cell).join(","))
    );
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} record${rows.length === 1 ? "" : "s"}.`);
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    els.themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* ignore */ }
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) { /* ignore */ }
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ---------- Events ---------- */
  function bindEvents() {
    $("#openAddBtn").addEventListener("click", () => openForm());
    $("#exportBtn").addEventListener("click", exportCSV);
    $("#themeToggle").addEventListener("click", () => {
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });
    $("#resetBtn").addEventListener("click", () => {
      state.students = buildSeed();
      state.page = 1;
      save();
      render();
      toast("Demo data restored.");
    });

    els.search.addEventListener("input", debounce((e) => {
      state.query = e.target.value;
      state.page = 1;
      render();
    }));
    els.courseFilter.addEventListener("change", (e) => { state.course = e.target.value; state.page = 1; render(); });
    els.statusFilter.addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; render(); });
    els.sortSelect.addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; render(); });

    els.prev.addEventListener("click", () => { state.page--; render(); });
    els.next.addEventListener("click", () => { state.page++; render(); });

    // Event delegation for row buttons
    els.body.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      btn.dataset.action === "edit" ? openForm(id) : askDelete(id);
    });

    // Form
    els.form.addEventListener("submit", handleSubmit);
    els.form.addEventListener("focusout", (e) => {
      const name = e.target.name;
      if (name && validators[name]) validateField(name);
    });
    els.dialog.addEventListener("click", (e) => {
      // Close on backdrop click or any [data-close] control
      if (e.target === els.dialog || e.target.closest("[data-close]")) els.dialog.close();
    });

    // Delete confirm
    $("#confirmDelete").addEventListener("click", confirmDelete);
    $("#cancelDelete").addEventListener("click", () => els.confirmDialog.close());
    els.confirmDialog.addEventListener("click", (e) => { if (e.target === els.confirmDialog) els.confirmDialog.close(); });
  }

  /* ---------- Init ---------- */
  function init() {
    initTheme();
    state.students = load();
    save(); // persist demo data on first run so other modules can read it
    bindEvents();
    render();
  }

  init();
})();
