/* EduTrack modules: navigation, profiles, attendance, marks, CSV import.
   Reads/writes Local Storage collections directly; app.js owns the students UI. */
(function () {
  "use strict";
  const K = { stu: "edutrack_students_v1", att: "edutrack_attendance_v1", mk: "edutrack_marks_v1", set: "edutrack_settings_v1" };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ----- storage (safe against empty / malformed data) ----- */
  const read = (k, fb) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(fb) ? (Array.isArray(v) ? v : fb) : (v && typeof v === "object" ? v : fb); }
    catch (_) { return fb; }
  };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { toast("Could not save data (storage unavailable).", true); return false; } };
  const students = () => read(K.stu, []).filter((s) => s && s.id && s.name);
  const settings = () => ({ attThreshold: 75, ...read(K.set, {}) });
  const nameOf = (id) => (students().find((s) => s.id === id) || {}).name || id;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function toast(msg, bad) {
    const el = document.createElement("div");
    el.className = "toast" + (bad ? " toast--error" : "");
    el.textContent = msg;
    $("#toastRegion").appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ----- CSV helpers ----- */
  function csvCell(v) { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function download(name, rows) {
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    a.click(); URL.revokeObjectURL(a.href);
  }
  function parseCSV(t) {
    const rows = []; let r = [], c = "", q = false;
    t = t.replace(/^\uFEFF/, "");
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { r.push(c); c = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; r.push(c); c = ""; rows.push(r); r = []; }
      else c += ch;
    }
    if (c || r.length) { r.push(c); rows.push(r); }
    return rows.filter((x) => x.some((v) => v.trim()));
  }

  /* ----- business rules (single place) ----- */
  function attStats(id) {
    const recs = read(K.att, []).filter((a) => a.studentId === id);
    const attended = recs.filter((a) => a.status === "Present").length;
    return { attended, total: recs.length, pct: recs.length ? (attended / recs.length) * 100 : null };
  }
  const grade = (p) => (p >= 90 ? "A" : p >= 75 ? "B" : p >= 60 ? "C" : p >= 40 ? "D" : "F");
  const MARK_PASS = 40;
  const MAXES = { internal: 20, assignment: 10, exam: 70 };
  const markTotal = (m) => m.internal + m.assignment + m.exam;

  /* ----- navigation ----- */
  function go(view) {
    $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== view));
    $$(".nav-item[data-nav]").forEach((b) => (b.dataset.nav === view ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    document.body.classList.remove("nav-open");
    if (view === "dashboard") refreshDash();
    if (view === "attendance") renderAttendance();
    if (view === "marks") renderMarks();
    if (view === "courses") renderCourses();
    if (view === "fees") renderFees();
    if (view === "reports") { renderCourses(); renderFees(); if($("#reportStudents")) $("#reportStudents").textContent=students().length; if($("#reportMarks")) $("#reportMarks").textContent=read(K.mk,[]).length; }
    if (view === "notifications") renderNotifications();
    if (view === "settings") renderSettings();
    window.scrollTo(0, 0);
  }
  function refreshDash() {
    const all = students(), thr = settings().attThreshold;
    const st = all.map((s) => attStats(s.id)).filter((x) => x.pct !== null);
    $("#statAtt").textContent = st.length ? (st.reduce((a, x) => a + x.pct, 0) / st.length).toFixed(1) + "%" : "–";
    $("#statLow").textContent = st.filter((x) => x.pct < thr).length;
  }

  /* ----- attendance ----- */
  function renderAttendance() {
    const sel = $("#attCourse"), cur = sel.value;
    const courses = [...new Set(students().map((s) => s.course))].sort();
    sel.innerHTML = courses.map((c) => `<option>${esc(c)}</option>`).join("");
    if (courses.includes(cur)) sel.value = cur;
    if (!$("#attDate").value) $("#attDate").value = new Date().toISOString().slice(0, 10);
    $("#attThr").value = settings().attThreshold;
    const list = students().filter((s) => s.course === sel.value).sort((a, b) => a.name.localeCompare(b.name));
    const date = $("#attDate").value, recs = read(K.att, []);
    $("#attEmpty").hidden = list.length > 0;
    $("#attBody").innerHTML = list.map((s) => {
      const ex = recs.find((a) => a.studentId === s.id && a.date === date);
      const val = ex ? ex.status : "Present";
      const radios = ["Present", "Absent", "On Leave"].map((o) =>
        `<label><input type="radio" name="att_${esc(s.id)}" value="${o}" ${o === val ? "checked" : ""}> ${o}</label>`).join("");
      return `<tr data-sid="${esc(s.id)}"><td data-label="Student">${esc(s.name)}</td><td data-label="ID" class="mono">${esc(s.id)}</td><td data-label="Status"><div class="seg">${radios}</div></td></tr>`;
    }).join("");
    const thr = settings().attThreshold;
    $("#attSum").innerHTML = list.map((s) => {
      const a = attStats(s.id);
      const low = a.pct !== null && a.pct < thr;
      return `<tr><td data-label="Student">${esc(s.name)}</td><td data-label="Attended">${a.attended}</td><td data-label="Recorded">${a.total}</td>
        <td data-label="%">${a.pct === null ? "–" : a.pct.toFixed(1) + "%"}</td>
        <td data-label="Flag">${a.pct === null ? "No data" : low ? '<span class="flag flag--bad">⚠ Below ' + thr + "%</span>" : "OK"}</td></tr>`;
    }).join("");
  }
  function saveAttendance() {
    const date = $("#attDate").value;
    if (!date) return toast("Select a date first.", true);
    const rows = $$("#attBody tr");
    if (!rows.length) return toast("No students to mark.", true);
    let recs = read(K.att, []), course = $("#attCourse").value;
    rows.forEach((tr) => {
      const sid = tr.dataset.sid, status = $("input:checked", tr).value;
      const i = recs.findIndex((a) => a.studentId === sid && a.date === date); // one record per student per date
      if (i >= 0) recs[i] = { ...recs[i], status }; else recs.push({ id: uid("att"), studentId: sid, date, status, course });
    });
    if (write(K.att, recs)) { toast("Attendance saved for " + date + "."); renderAttendance(); }
  }

  /* ----- marks ----- */
  let editingMark = null;
  function renderMarks() {
    const sel = $("#mkStudent"), cur = sel.value;
    sel.innerHTML = students().map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.id)})</option>`).join("");
    if (cur) sel.value = cur;
    const list = read(K.mk, []);
    $("#mkEmpty").hidden = list.length > 0;
    $("#mkBody").innerHTML = list.map((m) => {
      const t = markTotal(m);
      return `<tr data-id="${esc(m.id)}"><td data-label="Student">${esc(nameOf(m.studentId))}</td><td data-label="Subject">${esc(m.subject)}</td><td data-label="Sem">${esc(m.semester)}</td>
        <td data-label="Total">${t}/100</td><td data-label="%">${t.toFixed(1)}%</td><td data-label="Grade">${grade(t)}</td>
        <td data-label="Note">${t < MARK_PASS ? '<span class="flag flag--bad">⚠ Support recommended</span>' : "OK"}</td>
        <td data-label="Actions"><div class="row-actions"><button class="row-btn" data-a="edit" type="button">Edit</button><button class="row-btn row-btn--danger" data-a="del" type="button">Delete</button></div></td></tr>`;
    }).join("");
  }
  function submitMark(e) {
    e.preventDefault();
    const err = $("#mkError"), v = (id) => $(id).value.trim();
    const m = { studentId: v("#mkStudent"), subject: v("#mkSubject"), semester: Number(v("#mkSem")), internal: Number(v("#mkInt")), assignment: Number(v("#mkAsg")), exam: Number(v("#mkExam")) };
    const bad = !m.studentId ? "Select a student."
      : m.subject.length < 2 ? "Enter a subject name."
      : !Number.isInteger(m.semester) || m.semester < 1 || m.semester > 8 ? "Semester must be 1–8."
      : ["internal", "assignment", "exam"].map((k) => (v({ internal: "#mkInt", assignment: "#mkAsg", exam: "#mkExam" }[k]) === "" || isNaN(m[k]) || m[k] < 0 || m[k] > MAXES[k] ? `${k[0].toUpperCase() + k.slice(1)} marks must be between 0 and ${MAXES[k]}.` : "")).find(Boolean);
    if (bad) { err.textContent = bad; return; }
    err.textContent = "";
    const list = read(K.mk, []);
    const dupe = list.some((x) => x.id !== editingMark && x.studentId === m.studentId && x.subject.toLowerCase() === m.subject.toLowerCase() && x.semester === m.semester);
    if (dupe) { err.textContent = "Marks for this student, subject and semester already exist. Edit that record instead."; return; }
    if (editingMark) { const i = list.findIndex((x) => x.id === editingMark); list[i] = { ...list[i], ...m }; } else list.push({ id: uid("mk"), ...m });
    if (write(K.mk, list)) { toast(editingMark ? "Marks updated." : "Marks saved."); resetMarkForm(); renderMarks(); }
  }
  function resetMarkForm() { editingMark = null; $("#mkForm").reset(); $("#mkSubmit").textContent = "Save marks"; $("#mkCancel").hidden = true; }

  /* ----- profile ----- */
  let pfId = null;
  function openProfile(id) { pfId = id; $("#pfTitle").textContent = "Student profile"; setTab("overview"); $("#profileDialog").showModal(); }
  function setTab(tab) {
    $$(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    const s = students().find((x) => x.id === pfId);
    if (!s) { $("#pfBody").textContent = "Student not found."; return; }
    let html = "";
    if (tab === "overview") {
      html = `<dl class="pf-list"><dt>Name</dt><dd>${esc(s.name)}</dd><dt>ID</dt><dd>${esc(s.id)}</dd><dt>Email</dt><dd>${esc(s.email)}</dd><dt>Phone</dt><dd>${esc(s.phone)}</dd>
        <dt>Course</dt><dd>${esc(s.course)}</dd><dt>Year</dt><dd>${esc(s.year)}</dd><dt>GPA</dt><dd>${Number(s.gpa).toFixed(2)}</dd><dt>Status</dt><dd>${esc(s.status)}</dd></dl>`;
    } else if (tab === "attendance") {
      const a = attStats(s.id), recs = read(K.att, []).filter((r) => r.studentId === s.id).sort((x, y) => y.date.localeCompare(x.date));
      html = `<p><strong>${a.pct === null ? "No attendance recorded." : a.attended + " / " + a.total + " classes = " + a.pct.toFixed(1) + "%"}</strong>${a.pct !== null && a.pct < settings().attThreshold ? ' <span class="flag flag--bad">⚠ Below threshold</span>' : ""}</p>` +
        (recs.length ? "<ul>" + recs.slice(0, 15).map((r) => `<li>${esc(r.date)} – ${esc(r.status)}</li>`).join("") + "</ul>" : "");
    } else {
      const ms = read(K.mk, []).filter((m) => m.studentId === s.id).sort((x, y) => x.semester - y.semester);
      html = ms.length ? "<ul>" + ms.map((m) => `<li>Sem ${m.semester} – ${esc(m.subject)}: ${markTotal(m)}/100 (${grade(markTotal(m))})</li>`).join("") + "</ul>" : "<p>No marks recorded.</p>";
    }
    $("#pfBody").innerHTML = html;
  }

  /* ----- CSV import ----- */
  const REQ = ["name", "email", "phone", "course", "year", "gpa", "status"];
  let importRows = [];
  function checkRow(r, seen, ids) {
    if (r.name.length < 3 || !/^[A-Za-z .'-]+$/.test(r.name)) return "Invalid name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email)) return "Invalid email";
    if (!/^[6-9]\d{9}$/.test(r.phone)) return "Invalid phone (10 digits)";
    if (!r.course) return "Course missing";
    if (!["1", "2", "3", "4"].includes(r.year)) return "Year must be 1–4";
    const g = parseFloat(r.gpa); if (r.gpa === "" || isNaN(g) || g < 0 || g > 10) return "GPA must be 0–10";
    if (!["Active", "Inactive", "Graduated"].includes(r.status)) return "Status must be Active, Inactive or Graduated";
    return "";
  }
  function previewImport(text) {
    const rows = parseCSV(text), head = (rows[0] || []).map((h) => h.trim().toLowerCase());
    const missing = REQ.filter((c) => !head.includes(c));
    $("#imConfirm").disabled = true; importRows = [];
    if (missing.length) { $("#imPreview").innerHTML = `<p class="error" role="alert">Missing required column(s): ${esc(missing.join(", "))}</p>`; return; }
    const existing = new Set(students().map((s) => s.email.toLowerCase())), seen = new Set(), out = [];
    rows.slice(1).forEach((cells, i) => {
      const r = {}; REQ.forEach((c) => (r[c] = (cells[head.indexOf(c)] || "").trim()));
      let kind = "ok", reason = checkRow(r);
      if (reason) kind = "invalid";
      else if (existing.has(r.email.toLowerCase()) || seen.has(r.email.toLowerCase())) { kind = "dup"; reason = "Duplicate email (not imported)"; }
      seen.add(r.email.toLowerCase());
      out.push({ line: i + 2, r, kind, reason });
    });
    importRows = out;
    const n = (k) => out.filter((x) => x.kind === k).length;
    $("#imPreview").innerHTML = `<div class="im-sum"><span>Total rows: ${out.length}</span><span>Ready: ${n("ok")}</span><span>Duplicates: ${n("dup")}</span><span>Invalid: ${n("invalid")}</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th scope="col">Row</th><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Result</th></tr></thead><tbody>${out.map((x) =>
        `<tr><td data-label="Row">${x.line}</td><td data-label="Name">${esc(x.r.name)}</td><td data-label="Email">${esc(x.r.email)}</td><td data-label="Result">${x.kind === "ok" ? "✓ Ready" : '<span class="flag flag--bad">✗ ' + esc(x.reason) + "</span>"}</td></tr>`).join("")}</tbody></table></div>`;
    $("#imConfirm").disabled = n("ok") === 0;
  }
  function confirmImport() {
    const list = students(), ok = importRows.filter((x) => x.kind === "ok");
    let next = Math.max(1000, ...list.map((s) => parseInt(String(s.id).replace(/\D/g, ""), 10) || 0));
    ok.forEach((x, i) => list.push({ id: "STU" + ++next, name: x.r.name.replace(/\s+/g, " "), email: x.r.email.toLowerCase(), phone: x.r.phone, course: x.r.course, year: Number(x.r.year), gpa: Math.round(parseFloat(x.r.gpa) * 100) / 100, status: x.r.status, createdAt: Date.now() + i }));
    if (!write(K.stu, list)) return;
    const n = (k) => importRows.filter((x) => x.kind === k).length;
    $("#imPreview").innerHTML = `<p><strong>Import complete.</strong></p><div class="im-sum"><span>Total rows: ${importRows.length}</span><span>Imported: ${ok.length}</span><span>Duplicates: ${n("dup")}</span><span>Invalid: ${n("invalid")}</span></div>`;
    $("#imConfirm").hidden = true; $("#imCancel").textContent = "Done";
    $("#importDialog").addEventListener("close", () => location.reload(), { once: true }); // app.js reloads its in-memory list
  }
  function openImport() {
    $("#imFile").value = ""; $("#imPreview").innerHTML = ""; $("#imConfirm").hidden = false; $("#imConfirm").disabled = true; $("#imCancel").textContent = "Cancel";
    $("#importDialog").showModal();
  }

  /* ----- Additional modules: courses, departments, fees, reports, notifications, settings ----- */
  const EXTRA = { courses: "edutrack_courses_v1", departments: "edutrack_departments_v1", fees: "edutrack_fees_v1", notifications: "edutrack_notifications_v1", settingsInfo: "edutrack_college_settings_v1" };
  const money = n => Number(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });
  function rows(key) { return read(key, []); }
  function saveRows(key, data) { write(key, data); }
  function refreshCourseOptions() {
    const courses = rows(EXTRA.courses);
    const names = [...new Set([...courses.map(c => c.name), ...students().map(s => s.course)].filter(Boolean))].sort();
    ["attCourse", "courseFilter", "fCourse"].forEach(id => { const el = $("#" + id); if (!el) return; const old = el.value; const all = id === "courseFilter" ? '<option value="all">All courses</option>' : ""; el.innerHTML = all + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join(""); if (names.includes(old)) el.value = old; });
  }
  function renderCourses() {
    const cs = rows(EXTRA.courses), ds = rows(EXTRA.departments);
    if ($("#courseTableBody")) $("#courseTableBody").innerHTML = cs.length ? cs.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.code)}</td><td>${esc(c.department)}</td><td>${esc(c.duration)} years</td><td><button class="btn btn--danger btn--sm" data-course-delete="${esc(c.id)}">Delete</button></td></tr>`).join("") : '<tr><td colspan="5">No courses added yet.</td></tr>';
    if ($("#departmentTableBody")) $("#departmentTableBody").innerHTML = ds.length ? ds.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.head || "—")}</td><td><button class="btn btn--danger btn--sm" data-dept-delete="${esc(d.id)}">Delete</button></td></tr>`).join("") : '<tr><td colspan="3">No departments added yet.</td></tr>';
    if ($("#reportCourses")) $("#reportCourses").textContent = cs.length; if ($("#statCourses")) $("#statCourses").textContent = cs.length;
    refreshCourseOptions();
  }
  function renderFees() {
    const fs = rows(EXTRA.fees), total = fs.reduce((n,f) => n + Number(f.amount), 0), paid = fs.reduce((n,f) => n + Number(f.paid), 0);
    if ($("#feeTableBody")) $("#feeTableBody").innerHTML = fs.length ? fs.map(f => `<tr><td>${esc(nameOf(f.studentId))}</td><td>${esc(f.type)}</td><td>${money(f.amount)}</td><td>${money(f.paid)}</td><td>${money(Number(f.amount)-Number(f.paid))}</td><td>${esc(f.date)}</td><td><button class="btn btn--danger btn--sm" data-fee-delete="${esc(f.id)}">Delete</button></td></tr>`).join("") : '<tr><td colspan="7">No fee records yet.</td></tr>';
    if ($("#totalFees")) $("#totalFees").textContent = money(total); if ($("#paidFees")) $("#paidFees").textContent = money(paid); if ($("#pendingFees")) $("#pendingFees").textContent = money(total-paid); if ($("#reportFeeRecords")) $("#reportFeeRecords").textContent = fs.length;
    const select = $("#feeStudent"); if (select) { const old=select.value; select.innerHTML='<option value="">Select student</option>'+students().map(s=>`<option value="${esc(s.id)}">${esc(s.name)} (${esc(s.id)})</option>`).join(""); select.value=old; }
  }
  function downloadRows(filename, headers, data) { download(filename, [headers, ...data]); }
  function renderNotifications() { const list=rows(EXTRA.notifications); if ($("#notificationList")) $("#notificationList").innerHTML=list.length ? list.slice().reverse().map(n=>`<article class="card"><div class="between"><h3>${esc(n.title)}</h3><button class="btn btn--danger btn--sm" data-notification-delete="${esc(n.id)}">Delete</button></div><p>${esc(n.message)}</p><small class="muted">Audience: ${esc(n.audience)} · ${esc(n.date)}</small></article>`).join("") : '<p class="muted">No notifications published yet.</p>'; }
  function renderSettings() { let s=read(EXTRA.settingsInfo,{}); if(Array.isArray(s)) s={}; ["collegeName","collegeEmail","collegePhone"].forEach(id=>{if($("#"+id)) $("#"+id).value=s[id]||"";}); if($("#attendanceThreshold")) $("#attendanceThreshold").value=settings().attThreshold; }
  function bindExtraModules() {
    if ($("#courseForm")) $("#courseForm").addEventListener("submit", e=>{e.preventDefault(); const name=$("#courseName").value.trim(),code=$("#courseCode").value.trim(),department=$("#courseDept").value.trim(),duration=Number($("#courseDuration").value); const cs=rows(EXTRA.courses); if(cs.some(c=>c.code.toLowerCase()===code.toLowerCase())) return toast("Course code already exists.",true); cs.push({id:uid("crs"),name,code,department,duration}); saveRows(EXTRA.courses,cs); e.target.reset(); renderCourses(); toast("Course added."); });
    if ($("#departmentForm")) $("#departmentForm").addEventListener("submit",e=>{e.preventDefault(); const name=$("#departmentName").value.trim(),head=$("#departmentHead").value.trim(),ds=rows(EXTRA.departments); if(ds.some(d=>d.name.toLowerCase()===name.toLowerCase())) return toast("Department already exists.",true); ds.push({id:uid("dep"),name,head}); saveRows(EXTRA.departments,ds); e.target.reset(); renderCourses(); toast("Department added.");});
    if ($("#feeForm")) { $("#feeDate").value ||= new Date().toISOString().slice(0,10); $("#feeForm").addEventListener("submit",e=>{e.preventDefault(); const studentId=$("#feeStudent").value,amount=Number($("#feeAmount").value),paid=Number($("#feePaid").value),date=$("#feeDate").value; if(!studentId) return toast("Select a student first.",true); if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(paid)||paid<0||paid>amount) return toast("Payment must be between 0 and total fee.",true); const fs=rows(EXTRA.fees); fs.push({id:uid("fee"),studentId,type:$("#feeType").value,amount,paid,date,method:$("#feeMethod").value}); saveRows(EXTRA.fees,fs); e.target.reset(); $("#feeDate").value=new Date().toISOString().slice(0,10); renderFees(); toast("Fee record saved.");}); }
    if ($("#notificationForm")) $("#notificationForm").addEventListener("submit",e=>{e.preventDefault();const ns=rows(EXTRA.notifications);ns.push({id:uid("ntf"),title:$("#notificationTitle").value.trim(),message:$("#notificationMessage").value.trim(),audience:$("#notificationAudience").value,date:new Date().toLocaleString()});saveRows(EXTRA.notifications,ns);e.target.reset();renderNotifications();toast("Notification published.");});
    if ($("#settingsForm")) $("#settingsForm").addEventListener("submit",e=>{e.preventDefault();write(EXTRA.settingsInfo,{collegeName:$("#collegeName").value.trim(),collegeEmail:$("#collegeEmail").value.trim(),collegePhone:$("#collegePhone").value.trim()});const n=Number($("#attendanceThreshold").value);if(!Number.isFinite(n)||n<0||n>100)return toast("Threshold must be between 0 and 100.",true);write(K.set,{...settings(),attThreshold:n});$("#attThr").value=n;refreshDash();toast("Settings saved.");});
    $("#settingsExport")?.addEventListener("click",()=>{const backup={students:students(),attendance:read(K.att,[]),marks:read(K.mk,[]),courses:rows(EXTRA.courses),departments:rows(EXTRA.departments),fees:rows(EXTRA.fees),notifications:rows(EXTRA.notifications),settings:read(EXTRA.settingsInfo,{})};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="edutrack-backup.json";a.click();URL.revokeObjectURL(url);});
    $("#clearData")?.addEventListener("click",()=>{if(!confirm("This will delete all EduTrack records saved in this browser. Continue?"))return;Object.values(K).forEach(k=>localStorage.removeItem(k));Object.values(EXTRA).forEach(k=>localStorage.removeItem(k));toast("App data cleared. Reloading…");setTimeout(()=>location.reload(),500);});
    document.addEventListener("click",e=>{const c=e.target.closest("[data-course-delete]"),d=e.target.closest("[data-dept-delete]"),f=e.target.closest("[data-fee-delete]"),n=e.target.closest("[data-notification-delete]");if(c&&confirm("Delete this course? Existing student records will not be deleted.")){saveRows(EXTRA.courses,rows(EXTRA.courses).filter(x=>x.id!==c.dataset.courseDelete));renderCourses();}if(d&&confirm("Delete this department?")){saveRows(EXTRA.departments,rows(EXTRA.departments).filter(x=>x.id!==d.dataset.deptDelete));renderCourses();}if(f&&confirm("Delete this fee record?")){saveRows(EXTRA.fees,rows(EXTRA.fees).filter(x=>x.id!==f.dataset.feeDelete));renderFees();}if(n&&confirm("Delete this notification?")){saveRows(EXTRA.notifications,rows(EXTRA.notifications).filter(x=>x.id!==n.dataset.notificationDelete));renderNotifications();}});
    $("#reportExportStudents")?.addEventListener("click",()=>downloadRows("students.csv",["ID","Name","Email","Phone","Course","Year","GPA","Status"],students().map(s=>[s.id,s.name,s.email,s.phone,s.course,s.year,s.gpa,s.status])));
    const exportAtt=()=>downloadRows("attendance.csv",["Student ID","Name","Course","Date","Status"],read(K.att,[]).map(a=>[a.studentId,nameOf(a.studentId),a.course,a.date,a.status]));
    const exportMk=()=>downloadRows("marks.csv",["Student ID","Name","Subject","Semester","Internal","Assignment","Exam","Total","Grade"],read(K.mk,[]).map(m=>[m.studentId,nameOf(m.studentId),m.subject,m.semester,m.internal,m.assignment,m.exam,markTotal(m),grade(markTotal(m))]));
    $("#reportExportAttendance")?.addEventListener("click",exportAtt); $("#reportExportMarks")?.addEventListener("click",exportMk); $("#reportExportFees")?.addEventListener("click",()=>downloadRows("fees.csv",["Student ID","Name","Type","Amount","Paid","Pending","Date","Method"],rows(EXTRA.fees).map(f=>[f.studentId,nameOf(f.studentId),f.type,f.amount,f.paid,f.amount-f.paid,f.date,f.method])));
    $("#exportFees")?.addEventListener("click",()=>$("#reportExportFees")?.click());
  }

  /* ----- wiring ----- */
  function init() {
    $$(".nav-item[data-nav]").forEach((b) => b.addEventListener("click", () => go(b.dataset.nav)));
    $$("[data-nav-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.navGo)));
    $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
    $$("[data-quick=add]").forEach((b) => b.addEventListener("click", () => $("#openAddBtn").click()));
    $$("[data-quick=import]").forEach((b) => b.addEventListener("click", openImport));
    $("#tplBtn").addEventListener("click", () => download("students-template.csv", [REQ, ["Asha Verma", "asha.verma@example.com", "9876501234", "Computer Science", "2", "8.4", "Active"]]));

    $("#attCourse").addEventListener("change", renderAttendance);
    $("#attDate").addEventListener("change", renderAttendance);
    $("#attThr").addEventListener("change", (e) => {
      const n = Number(e.target.value);
      if (isNaN(n) || n < 0 || n > 100) { toast("Threshold must be 0–100.", true); e.target.value = settings().attThreshold; return; }
      write(K.set, { ...settings(), attThreshold: n }); renderAttendance(); toast("Threshold updated.");
    });
    $("#attSave").addEventListener("click", saveAttendance);
    $("#attExport").addEventListener("click", () => {
      const recs = read(K.att, []).filter((a) => a.course === $("#attCourse").value);
      if (!recs.length) return toast("No attendance records to export.", true);
      download("attendance.csv", [["Student ID", "Name", "Course", "Date", "Status"]].concat(recs.map((a) => [a.studentId, nameOf(a.studentId), a.course, a.date, a.status])));
    });

    $("#mkForm").addEventListener("submit", submitMark);
    $("#mkCancel").addEventListener("click", () => { resetMarkForm(); $("#mkError").textContent = ""; });
    $("#mkBody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-a]"); if (!btn) return;
      const id = btn.closest("tr").dataset.id, list = read(K.mk, []), m = list.find((x) => x.id === id); if (!m) return;
      if (btn.dataset.a === "del") {
        if (confirm(`Delete marks for ${nameOf(m.studentId)} – ${m.subject}?`)) { write(K.mk, list.filter((x) => x.id !== id)); renderMarks(); toast("Marks deleted."); }
      } else {
        editingMark = id; $("#mkStudent").value = m.studentId; $("#mkSubject").value = m.subject; $("#mkSem").value = m.semester;
        $("#mkInt").value = m.internal; $("#mkAsg").value = m.assignment; $("#mkExam").value = m.exam;
        $("#mkSubmit").textContent = "Update marks"; $("#mkCancel").hidden = false; $("#mkSubject").focus();
      }
    });
    $("#mkExport").addEventListener("click", () => {
      const list = read(K.mk, []);
      if (!list.length) return toast("No marks to export.", true);
      download("marks.csv", [["Student ID", "Name", "Subject", "Semester", "Internal", "Assignment", "Exam", "Total", "Percentage", "Grade"]].concat(list.map((m) => [m.studentId, nameOf(m.studentId), m.subject, m.semester, m.internal, m.assignment, m.exam, markTotal(m), markTotal(m).toFixed(1), grade(markTotal(m))])));
    });

    $("#studentBody").addEventListener("click", (e) => {
      const hit = e.target.closest(".student__name, .mono"); if (!hit) return;
      openProfile(hit.closest("tr").dataset.id);
    });
    $$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    ["profileDialog", "importDialog"].forEach((id) => {
      const d = document.getElementById(id);
      d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
    });
    $("#imFile").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 1024 * 1024) { $("#imPreview").innerHTML = '<p class="error" role="alert">File too large (max 1 MB).</p>'; return; }
      const rd = new FileReader(); rd.onload = () => previewImport(String(rd.result)); rd.onerror = () => toast("Could not read file.", true); rd.readAsText(f);
    });
    $("#imConfirm").addEventListener("click", confirmImport);
    bindExtraModules(); renderCourses(); renderFees(); renderNotifications(); renderSettings();
    go("dashboard");
  }
  init();
})();
