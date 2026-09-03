(function () {
  'use strict';

  // 'port/8010' is rewritten to the real proxy path by deploy_website.
  const API = 'http://localhost:8010';

  // Token kept in memory only (this is a single-page app; no full navigation
  // happens after login, so we never need to persist it across a reload --
  // sidesteps the "no localStorage in hosted iframe preview" constraint).
  let TOKEN = '';
  let ME = null;

  const el = (id) => document.getElementById(id);
  const show = (id) => el(id).classList.remove('hidden');
  const hide = (id) => el(id).classList.add('hidden');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new Error((body && body.detail) || ('HTTP ' + res.status));
    return body;
  }

  /* ================= LOGIN ================= */
  el('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hide('loginError');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: el('loginEmail').value.trim(), password: el('loginPassword').value }),
      });
      TOKEN = data.token;
      ME = { full_name: data.full_name, role: data.role };
      enterApp();
    } catch (err) {
      el('loginError').textContent = err.message;
      show('loginError');
    }
  });

  el('logoutBtn').addEventListener('click', () => {
    TOKEN = ''; ME = null;
    hide('appView'); show('loginView');
    el('loginForm').reset();
  });

  function enterApp() {
    hide('loginView'); show('appView');
    el('userName').textContent = ME.full_name;
    el('userRoleBadge').textContent = ME.role;
    el('userRoleBadge').className = 'badge badge--' + ME.role;
    ['adminPanel', 'instructorPanel', 'studentPanel'].forEach(hide);
    if (ME.role === 'admin') { show('adminPanel'); loadAdmin(); }
    if (ME.role === 'instructor') { show('instructorPanel'); loadInstructor(); }
    if (ME.role === 'student') { show('studentPanel'); loadStudent(); }
  }

  /* ================= ADMIN ================= */
  el('acRole').addEventListener('change', () => {
    el('acStudentIdField').style.display = el('acRole').value === 'student' ? '' : 'none';
  });

  el('adminCreateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hide('adminCreateMsg');
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: el('acEmail').value.trim(), password: el('acPassword').value, full_name: el('acName').value.trim(),
          role: el('acRole').value, student_id: el('acRole').value === 'student' ? el('acStudentId').value.trim() : null,
        }),
      });
      el('adminCreateForm').reset();
      loadAdmin();
    } catch (err) {
      el('adminCreateMsg').textContent = err.message; show('adminCreateMsg');
    }
  });

  async function loadAdmin() {
    const users = await api('/api/admin/users');
    el('adminUserRows').innerHTML = users.map((u) => `
      <tr>
        <td>${esc(u.full_name)}</td>
        <td class="mono">${esc(u.email)}</td>
        <td><span class="badge badge--${u.role}">${u.role}</span></td>
        <td class="mono">${esc(u.student_id || '-')}</td>
        <td>${u.is_active ? 'ใช้งานอยู่' : '<span class="dim">ปิดใช้งาน</span>'}</td>
        <td>
          <button class="btn btn--ghost btn--sm" data-toggle="${u.id}" data-active="${u.is_active}">${u.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
          <button class="btn btn--danger btn--sm" data-del="${u.id}">ลบ</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty-state">ยังไม่มีผู้ใช้</td></tr>';

    el('adminUserRows').querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      await api('/api/admin/users/' + b.dataset.toggle, { method: 'PATCH', body: JSON.stringify({ is_active: b.dataset.active !== 'true' }) });
      loadAdmin();
    }));
    el('adminUserRows').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('ลบผู้ใช้นี้ถาวร?')) return;
      await api('/api/admin/users/' + b.dataset.del, { method: 'DELETE' });
      loadAdmin();
    }));

    try {
      const courses = await api('/api/admin/dashboard');
      el('adminDashboard').innerHTML = courses.map((c) => `
        <div class="dash-course-block">
          <h3>${esc(c.course_title)}</h3>
          <div class="dash-course-stats">นักศึกษา ${c.student_count} คน · ความคืบหน้าเฉลี่ย ${c.avg_complete}% · คะแนนเฉลี่ย ${c.avg_score != null ? c.avg_score + '%' : '—'}</div>
          ${c.students.map((s) => `
            <div class="dash-student-block">
              <div class="dash-student-head"><span>${esc(s.full_name)} <span class="dim small">(${esc(s.student_code || '-')})</span></span>${gradeBadge(s.grade)}</div>
              <div class="dash-bar-row-line">
                <span class="dash-label">ความคืบหน้า</span>
                <div class="dash-bar-track"><div class="dash-bar-fill--complete" style="width:${s.percent_complete}%;"></div></div>
                <span class="dash-value">${s.percent_complete}%</span>
              </div>
              <div class="dash-bar-row-line">
                <span class="dash-label">คะแนน</span>
                <div class="dash-bar-track"><div class="dash-bar-fill--score" style="width:${s.percent_score ?? 0}%;"></div></div>
                <span class="dash-value">${s.percent_score != null ? s.percent_score + '%' : '—'}</span>
              </div>
            </div>`).join('') || '<p class="empty-state">ยังไม่มีนักศึกษาในคอร์สนี้</p>'}
        </div>`).join('') || '<p class="empty-state">ยังไม่มีคอร์ส</p>';
    } catch (err) {
      el('adminDashboard').innerHTML = `<p class="dim small">โหลดแดชบอร์ดไม่สำเร็จ: ${esc(err.message)}</p>`;
    }
  }

  /* ================= INSTRUCTOR ================= */
  el('createStudentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hide('createStudentMsg');
    try {
      await api('/api/instructor/students', {
        method: 'POST',
        body: JSON.stringify({
          email: el('csEmail').value.trim(), password: el('csPassword').value,
          full_name: el('csName').value.trim(), student_id: el('csStudentId').value.trim(),
        }),
      });
      el('createStudentForm').reset();
      el('createStudentMsg').textContent = 'สร้างบัญชีนักศึกษาสำเร็จ — ให้ Whitelist รหัสนักศึกษาด้านล่างเพื่อให้เข้าคอร์สได้';
      el('createStudentMsg').style.color = 'var(--color-success)';
      show('createStudentMsg');
    } catch (err) {
      el('createStudentMsg').style.color = 'var(--color-danger)';
      el('createStudentMsg').textContent = err.message; show('createStudentMsg');
    }
  });

  el('createCourseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hide('createCourseMsg');
    try {
      await api('/api/instructor/courses', {
        method: 'POST',
        body: JSON.stringify({
          slug: el('ccSlug').value.trim(), title: el('ccTitle').value.trim(),
          description: el('ccDescription').value.trim() || null,
          course_url: el('ccUrl').value.trim() || null,
        }),
      });
      el('createCourseForm').reset();
      el('createCourseMsg').style.color = 'var(--color-success)';
      el('createCourseMsg').textContent = 'สร้างคอร์สสำเร็จ เลื่อนลงดูด้านล่างเพื่อ whitelist นักศึกษา';
      show('createCourseMsg');
      loadInstructor();
    } catch (err) {
      el('createCourseMsg').style.color = 'var(--color-danger)';
      el('createCourseMsg').textContent = err.message; show('createCourseMsg');
    }
  });

  async function downloadGrades(courseId, slugHint) {
    const res = await fetch(API + `/api/instructor/courses/${courseId}/grades/export`, {
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if (!res.ok) { alert('ดาวน์โหลดไม่สำเร็จ'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `grades_${slugHint || courseId}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function gradesTableHtml(rows) {
    if (!rows.length) return '<p class="empty-state">ยังไม่มีนักศึกษาในคอร์สนี้</p>';
    return `<table>
      <thead><tr><th>ชื่อ</th><th>รหัสนักศึกษา</th><th>ความคืบหน้า</th><th>คะแนน</th><th>เกรด</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${esc(r.full_name)}</td>
          <td class="mono">${esc(r.student_code || '-')}</td>
          <td>${r.percent_complete}% <span class="dim small">(${r.completed_quizzes}/${r.total_quizzes})</span></td>
          <td>${r.percent_score != null ? `${r.total_score}/${r.total_max} (${r.percent_score}%)` : '<span class="dim">—</span>'}</td>
          <td>${gradeBadge(r.grade)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  async function loadInstructor() {
    const courses = await api('/api/instructor/courses');
    const blocks = await Promise.all(courses.map(async (c) => {
      const roster = await api(`/api/instructor/courses/${c.id}/students`);
      return `
        <div class="card">
          <h2>${esc(c.title)}</h2>
          <form class="inline-form" data-whitelist="${c.id}">
            <div class="field"><label>รหัสนักศึกษาที่ต้องการให้สิทธิ์</label><input type="text" name="student_id" required></div>
            <button class="btn btn--primary" type="submit">เพิ่มสิทธิ์ (Whitelist)</button>
          </form>
          <p class="error-msg hidden" data-msg="${c.id}"></p>
          <table>
            <thead><tr><th>ชื่อ</th><th>รหัสนักศึกษา</th><th></th></tr></thead>
            <tbody>${roster.map((r) => `
              <tr><td>${esc(r.full_name)}</td><td class="mono">${esc(r.student_id)}</td>
              <td><button class="btn btn--danger btn--sm" data-revoke="${c.id}:${r.id}">เพิกถอน</button></td></tr>`).join('')
              || '<tr><td colspan="3" class="empty-state">ยังไม่มีนักศึกษาได้รับสิทธิ์</td></tr>'}
            </tbody>
          </table>
          <button class="btn btn--ghost btn--sm" data-toggle-chapmgr="${c.id}" type="button">จัดการบทเรียนและควิซ</button>
          <div class="hidden" id="chapterMgr-${c.id}" style="margin-top:var(--space-4);"></div>
          <div class="sub-card" style="margin-top:var(--space-4);">
            <div class="grades-toolbar">
              <h4 style="margin:0;">สรุปคะแนนนักศึกษา</h4>
              <button class="btn btn--ghost btn--sm" data-export-grades="${c.id}" data-slug="${esc(c.slug || c.id)}" type="button">⬇️ ดาวน์โหลดคะแนน (Excel)</button>
            </div>
            <div id="gradesTable-${c.id}"><p class="dim small">กำลังโหลดคะแนน...</p></div>
          </div>
        </div>`;
    }));
    el('instructorCourses').innerHTML = blocks.join('') || '<p class="empty-state">คุณยังไม่มีคอร์สที่รับผิดชอบ</p>';
    el('instructorCourses').querySelectorAll('[data-toggle-chapmgr]').forEach((b) => b.addEventListener('click', async () => {
      const box = el('chapterMgr-' + b.dataset.toggleChapmgr);
      if (box.classList.contains('hidden') && !box.dataset.loaded) {
        await renderChapterManager(b.dataset.toggleChapmgr, box);
        box.dataset.loaded = '1';
      }
      box.classList.toggle('hidden');
      b.textContent = box.classList.contains('hidden') ? 'จัดการบทเรียนและควิซ' : 'ซ่อนบทเรียนและควิซ';
    }));

    el('instructorCourses').querySelectorAll('form[data-whitelist]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cid = f.dataset.whitelist;
      const msg = el('instructorCourses').querySelector(`[data-msg="${cid}"]`);
      msg.classList.add('hidden');
      try {
        await api(`/api/instructor/courses/${cid}/enrollments`, {
          method: 'POST', body: JSON.stringify({ student_id: f.student_id.value.trim() }),
        });
        loadInstructor();
      } catch (err) {
        msg.style.color = 'var(--color-danger)'; msg.textContent = err.message; msg.classList.remove('hidden');
      }
    }));
    el('instructorCourses').querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
      const [cid, uid] = b.dataset.revoke.split(':');
      await api(`/api/instructor/courses/${cid}/enrollments/${uid}`, { method: 'DELETE' });
      loadInstructor();
    }));
    el('instructorCourses').querySelectorAll('[data-export-grades]').forEach((b) => b.addEventListener('click', () => {
      downloadGrades(b.dataset.exportGrades, b.dataset.slug);
    }));

    courses.forEach(async (c) => {
      const box = el('gradesTable-' + c.id);
      try {
        const rows = await api(`/api/instructor/courses/${c.id}/grades`);
        box.innerHTML = gradesTableHtml(rows);
      } catch (err) {
        box.innerHTML = `<p class="dim small">โหลดคะแนนไม่สำเร็จ: ${esc(err.message)}</p>`;
      }
    });
  }

  /* ================= STUDENT ================= */
  function gradeBadge(grade) {
    const g = grade || 'none';
    return `<span class="grade-badge grade-badge--${g}">${grade || '—'}</span>`;
  }

  function progressBlockHtml(prog) {
    const pct = prog.percent_complete ?? 0;
    const scoreLine = prog.percent_score != null
      ? `<span class="dim">คะแนนรวม ${prog.total_score}/${prog.total_max} (${prog.percent_score}%)</span> ${gradeBadge(prog.grade)}`
      : '<span class="dim">ยังไม่มีควิซที่ตรวจให้คะแนนแล้ว</span>';
    const missing = (prog.missing_quizzes || []);
    const missingHtml = missing.length
      ? `<ul class="missing-quiz-list">${missing.map((m) => `<li>${esc(m.chapter_title)} — ${esc(m.quiz_title)}</li>`).join('')}</ul>`
      : '<p class="dim small">ทำควิซครบทุกบทแล้ว 🎉</p>';
    return `
      <div class="progress-summary">
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
        <span class="progress-pct">${pct}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-2);font-size:.85rem;">${scoreLine}</div>
      <p class="dim small" style="margin:6px 0 4px;">ควิซที่ยังไม่ได้ทำ / ยังไม่เสร็จ:</p>
      ${missingHtml}`;
  }

  async function loadStudent() {
    const courses = await api('/api/student/courses');
    el('studentCourseList').innerHTML = courses.map((c) => `
      <div class="course-tile" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-4);flex-wrap:wrap;">
          <div>
            <div class="course-tile__title">${esc(c.title)}</div>
            <div class="course-tile__desc">${esc(c.description || '')}</div>
          </div>
          <div>
            ${c.course_url ? `<a class="btn btn--ghost btn--sm" href="${esc(c.course_url)}" target="_blank" rel="noopener">ลิงก์คอร์สภายนอก</a>` : ''}
            <button class="btn btn--primary btn--sm" data-toggle-scourse="${c.id}" type="button">ดูบทเรียน</button>
          </div>
        </div>
        <div class="sub-card" style="margin-top:var(--space-3);" id="sprogress-${c.id}"><p class="dim small">กำลังโหลดความคืบหน้า...</p></div>
        <div class="hidden" id="scourse-${c.id}" style="margin-top:var(--space-4);"></div>
      </div>`).join('') || '<p class="empty-state">คุณยังไม่ได้รับสิทธิ์เข้าคอร์สใด — กรุณาติดต่ออาจารย์ผู้สอน</p>';

    el('studentCourseList').querySelectorAll('[data-toggle-scourse]').forEach((b) => b.addEventListener('click', async () => {
      const box = el('scourse-' + b.dataset.toggleScourse);
      if (box.classList.contains('hidden') && !box.dataset.loaded) {
        await renderStudentChapters(b.dataset.toggleScourse, box);
        box.dataset.loaded = '1';
      }
      box.classList.toggle('hidden');
      b.textContent = box.classList.contains('hidden') ? 'ดูบทเรียน' : 'ซ่อนบทเรียน';
    }));

    courses.forEach(async (c) => {
      const box = el('sprogress-' + c.id);
      try {
        const prog = await api(`/api/student/courses/${c.id}/progress`);
        box.innerHTML = progressBlockHtml(prog);
      } catch (err) {
        box.innerHTML = `<p class="dim small">โหลดความคืบหน้าไม่สำเร็จ: ${esc(err.message)}</p>`;
      }
    });
  }

  /* ================= INSTRUCTOR: CHAPTERS / QUIZ BUILDER ================= */
  const QTYPE_LABELS = {
    multiple_choice: 'ปรนัย (เลือกตอบ)',
    short_answer: 'เติมคำตอบสั้น',
    numeric: 'ตัวเลข (มีค่าคลาดเคลื่อน)',
    sequencing: 'เรียงลำดับขั้นตอน',
    hotspot: 'คลิกจุดในภาพ',
    file_upload: 'แนบไฟล์',
  };

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(API + '/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd });
    let body = null;
    try { body = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new Error((body && body.detail) || 'อัปโหลดไฟล์ไม่สำเร็จ');
    return body.url;
  }

  async function renderChapterManager(courseId, box) {
    const chapters = await api(`/api/instructor/courses/${courseId}/chapters`);
    box.innerHTML = `
      <div class="sub-card">
        ${chapters.map((ch) => chapterCardHtml(ch)).join('') || '<p class="empty-state">ยังไม่มีบทเรียน</p>'}
        <form class="inline-form" data-add-chapter="${courseId}">
          <div class="field"><label>เพิ่มบทใหม่</label><input name="title" placeholder="เช่น บทที่ 1: พื้นฐาน K-Factor" required></div>
          <button class="btn btn--primary btn--sm" type="submit">เพิ่มบท</button>
        </form>
      </div>`;
    box.querySelector('[data-add-chapter]').addEventListener('submit', async (e) => {
      e.preventDefault();
      await api(`/api/instructor/courses/${courseId}/chapters`, { method: 'POST', body: JSON.stringify({ title: e.target.title.value.trim() }) });
      await renderChapterManager(courseId, box);
    });
    box.querySelectorAll('[data-del-chapter]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('ลบบทนี้ถาวร (รวมเนื้อหาและควิซทั้งหมดในบท)?')) return;
      await api('/api/instructor/chapters/' + b.dataset.delChapter, { method: 'DELETE' });
      await renderChapterManager(courseId, box);
    }));
    box.querySelectorAll('[data-toggle-chapter]').forEach((b) => b.addEventListener('click', async () => {
      const body = box.querySelector('#chapterBody-' + b.dataset.toggleChapter);
      if (body.classList.contains('hidden') && !body.dataset.loaded) {
        await renderChapterBody(b.dataset.toggleChapter, body);
        body.dataset.loaded = '1';
      }
      body.classList.toggle('hidden');
    }));
  }

  function chapterCardHtml(ch) {
    return `
      <div class="chapter-card">
        <div class="chapter-card__head">
          <strong>${esc(ch.title)}</strong>
          <div>
            <button class="btn btn--ghost btn--sm" data-toggle-chapter="${ch.id}" type="button">เนื้อหา &amp; ควิซ</button>
            <button class="btn btn--danger btn--sm" data-del-chapter="${ch.id}" type="button">ลบบท</button>
          </div>
        </div>
        <div class="chapter-card__body hidden" id="chapterBody-${ch.id}"></div>
      </div>`;
  }

  async function renderChapterBody(chapterId, body) {
    const [materials, quizzes] = await Promise.all([
      api(`/api/instructor/chapters/${chapterId}/materials`),
      api(`/api/instructor/chapters/${chapterId}/quizzes`),
    ]);
    body.innerHTML = `
      <div class="sub-card">
        <h4>เนื้อหาในบทนี้</h4>
        ${materials.map((m) => materialRowHtml(m)).join('') || '<p class="empty-state">ยังไม่มีเนื้อหา</p>'}
        <form class="inline-form" data-add-material="${chapterId}">
          <div class="field"><label>ประเภท</label>
            <select name="type">
              <option value="text">ข้อความ</option>
              <option value="image">รูปภาพ</option>
              <option value="audio">เสียง</option>
            </select>
          </div>
          <div class="field"><label>ชื่อเนื้อหา</label><input name="title" required></div>
          <div class="field mat-body-field"><label>เนื้อหา (สำหรับข้อความ)</label><input name="body"></div>
          <div class="field mat-file-field hidden"><label>ไฟล์</label><input type="file" name="file"></div>
          <button class="btn btn--primary btn--sm" type="submit">เพิ่มเนื้อหา</button>
        </form>
        <p class="error-msg hidden" data-mat-msg></p>
      </div>
      <div class="sub-card">
        <h4>ควิซในบทนี้</h4>
        ${quizzes.map((q) => quizCardHtml(q)).join('') || '<p class="empty-state">ยังไม่มีควิซ</p>'}
        <form class="inline-form" data-add-quiz="${chapterId}">
          <div class="field"><label>ชื่อควิซใหม่</label><input name="title" placeholder="เช่น ควิซท้ายบท" required></div>
          <button class="btn btn--primary btn--sm" type="submit">สร้างควิซ</button>
        </form>
      </div>`;

    const matForm = body.querySelector('[data-add-material]');
    matForm.type.addEventListener('change', () => {
      const isText = matForm.type.value === 'text';
      matForm.querySelector('.mat-body-field').classList.toggle('hidden', !isText);
      matForm.querySelector('.mat-file-field').classList.toggle('hidden', isText);
    });
    matForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = body.querySelector('[data-mat-msg]'); msg.classList.add('hidden');
      try {
        let file_url = null;
        if (matForm.type.value !== 'text' && matForm.file.files[0]) file_url = await uploadFile(matForm.file.files[0]);
        await api(`/api/instructor/chapters/${chapterId}/materials`, {
          method: 'POST',
          body: JSON.stringify({ type: matForm.type.value, title: matForm.title.value.trim(), body: matForm.body.value.trim() || null, file_url }),
        });
        await renderChapterBody(chapterId, body);
      } catch (err) { msg.textContent = err.message; msg.classList.remove('hidden'); }
    });
    body.querySelectorAll('[data-del-material]').forEach((b) => b.addEventListener('click', async () => {
      await api('/api/instructor/materials/' + b.dataset.delMaterial, { method: 'DELETE' });
      await renderChapterBody(chapterId, body);
    }));

    body.querySelector('[data-add-quiz]').addEventListener('submit', async (e) => {
      e.preventDefault();
      await api(`/api/instructor/chapters/${chapterId}/quizzes`, { method: 'POST', body: JSON.stringify({ title: e.target.title.value.trim() }) });
      await renderChapterBody(chapterId, body);
    });
    body.querySelectorAll('[data-del-quiz]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('ลบควิซนี้ถาวร?')) return;
      await api('/api/instructor/quizzes/' + b.dataset.delQuiz, { method: 'DELETE' });
      await renderChapterBody(chapterId, body);
    }));
    body.querySelectorAll('[data-toggle-quiz]').forEach((b) => b.addEventListener('click', async () => {
      const qbody = body.querySelector('#quizBody-' + b.dataset.toggleQuiz);
      if (qbody.classList.contains('hidden') && !qbody.dataset.loaded) {
        await renderQuizBody(b.dataset.toggleQuiz, qbody);
        qbody.dataset.loaded = '1';
      }
      qbody.classList.toggle('hidden');
    }));
    body.querySelectorAll('[data-toggle-grading]').forEach((b) => b.addEventListener('click', async () => {
      const gbody = body.querySelector('#gradingBody-' + b.dataset.toggleGrading);
      if (gbody.classList.contains('hidden')) await renderGradingBody(b.dataset.toggleGrading, gbody);
      gbody.classList.toggle('hidden');
    }));
  }

  function materialRowHtml(m) {
    const typeLabel = { text: 'ข้อความ', image: 'รูปภาพ', audio: 'เสียง' }[m.type] || m.type;
    return `<div class="material-row">
      <div><span class="badge--qtype">${typeLabel}</span> <strong>${esc(m.title)}</strong>${m.body ? `<div class="dim small">${esc(m.body)}</div>` : ''}${m.file_url ? `<div class="dim small mono">${esc(m.file_url)}</div>` : ''}</div>
      <button class="btn btn--danger btn--sm" data-del-material="${m.id}" type="button">ลบ</button>
    </div>`;
  }

  function quizCardHtml(q) {
    return `
      <div class="quiz-card">
        <div class="quiz-card__head">
          <strong>${esc(q.title)}</strong>
          <div>
            <button class="btn btn--ghost btn--sm" data-toggle-quiz="${q.id}" type="button">คำถาม</button>
            <button class="btn btn--ghost btn--sm" data-toggle-grading="${q.id}" type="button">ตรวจ/คะแนน</button>
            <button class="btn btn--danger btn--sm" data-del-quiz="${q.id}" type="button">ลบควิซ</button>
          </div>
        </div>
        <div class="quiz-card__body hidden" id="quizBody-${q.id}"></div>
        <div class="quiz-card__body hidden" id="gradingBody-${q.id}"></div>
      </div>`;
  }

  async function renderQuizBody(quizId, body) {
    const questions = await api(`/api/instructor/quizzes/${quizId}/questions`);
    body.innerHTML = `
      ${questions.map((q) => questionRowHtml(q)).join('') || '<p class="empty-state">ยังไม่มีคำถาม</p>'}
      ${questionFormHtml(quizId)}`;
    body.querySelectorAll('[data-del-question]').forEach((b) => b.addEventListener('click', async () => {
      await api('/api/instructor/questions/' + b.dataset.delQuestion, { method: 'DELETE' });
      await renderQuizBody(quizId, body);
    }));
    wireQuestionForm(body.querySelector('[data-add-question]'), quizId, body);
  }

  function questionRowHtml(q) {
    const p = q.params || {};
    let detail = '';
    if (q.quiz_type === 'multiple_choice') detail = `ตัวเลือก: ${(p.options || []).join(' / ')} — เฉลย: ${(p.options || [])[p.correct_index]}`;
    else if (q.quiz_type === 'short_answer') detail = `คีย์เวิร์ด: ${(p.keywords || []).join(', ')}`;
    else if (q.quiz_type === 'numeric') detail = `เฉลย: ${p.target} ± ${p.tolerance}`;
    else if (q.quiz_type === 'sequencing') detail = `ลำดับที่ถูก: ${(p.items || []).join(' → ')}`;
    else if (q.quiz_type === 'hotspot') detail = `รูป: ${p.image_url || '-'}`;
    else if (q.quiz_type === 'file_upload') detail = `รับไฟล์สูงสุด ${p.max_mb || '-'} MB`;
    return `<div class="question-row">
      <div><span class="badge--qtype">${QTYPE_LABELS[q.quiz_type] || q.quiz_type}</span><strong> ${esc(q.prompt)}</strong> (${q.points} คะแนน)
        <div class="dim small">${esc(detail)}</div></div>
      <button class="btn btn--danger btn--sm" data-del-question="${q.id}" type="button">ลบ</button>
    </div>`;
  }

  function questionFormHtml(quizId) {
    return `
      <form class="question-form" data-add-question="${quizId}">
        <div class="field"><label>คำถาม</label><input name="prompt" required></div>
        <div class="inline-form">
          <div class="field"><label>คะแนนเต็ม</label><input name="points" type="number" step="0.5" min="0.5" value="1" required></div>
          <div class="field"><label>ประเภทคำถาม</label>
            <select name="quiz_type" class="qtype-select">
              ${Object.entries(QTYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div data-qf="multiple_choice">
          <div class="field"><label>ตัวเลือก (บรรทัดละ 1 ตัวเลือก อย่างน้อย 2 ตัวเลือก)</label>
            <textarea name="mc_options" rows="3" placeholder="พิมพ์ตัวเลือกแรก กด Enter แล้วพิมพ์ตัวเลือกถัดไป"></textarea></div>
          <div class="field"><label>ลำดับตัวเลือกที่ถูกต้อง (เริ่มนับที่ 1)</label><input name="mc_correct" type="number" min="1" value="1"></div>
        </div>
        <div data-qf="short_answer" class="hidden">
          <div class="field"><label>คีย์เวิร์ดคำตอบที่ถูกต้อง (คั่นด้วย , ถ้ามีหลายคำตอบที่ยอมรับได้)</label>
            <input name="sa_keywords" placeholder="เช่น bend allowance, bend deduction"></div>
          <label class="checkbox-field"><input type="checkbox" name="sa_case"> ตรวจตัวพิมพ์ใหญ่-เล็ก (case-sensitive)</label>
        </div>
        <div data-qf="numeric" class="hidden">
          <div class="inline-form">
            <div class="field"><label>คำตอบที่ถูกต้อง</label><input name="num_target" type="number" step="any"></div>
            <div class="field"><label>ค่าคลาดเคลื่อนที่ยอมรับ (±)</label><input name="num_tolerance" type="number" step="any" value="0"></div>
          </div>
        </div>
        <div data-qf="sequencing" class="hidden">
          <div class="field"><label>ขั้นตอนเรียงตามลำดับที่ถูกต้อง (บรรทัดละ 1 ขั้นตอน จากบนลงล่าง)</label>
            <textarea name="seq_items" rows="3" placeholder="พิมพ์ขั้นตอนแรก กด Enter แล้วพิมพ์ขั้นตอนถัดไปตามลำดับที่ถูกต้อง"></textarea></div>
        </div>
        <div data-qf="hotspot" class="hidden">
          <div class="field"><label>อัปโหลดรูปภาพ แล้วคลิกบนรูปเพื่อกำหนดจุดคำตอบที่ถูกต้อง</label><input type="file" name="hs_image" accept="image/*"></div>
          <div class="hotspot-editor" data-hs-editor></div>
          <p class="hint-sm" data-hs-status>ยังไม่ได้กำหนดจุด</p>
        </div>
        <div data-qf="file_upload" class="hidden">
          <div class="field"><label>ขนาดไฟล์สูงสุด (MB)</label><input name="fu_max_mb" type="number" value="10" min="1"></div>
        </div>
        <p class="error-msg hidden" data-qform-msg></p>
        <button class="btn btn--primary btn--sm" type="submit">เพิ่มคำถามนี้</button>
      </form>`;
  }

  function wireQuestionForm(form, quizId, scope) {
    const sections = form.querySelectorAll('[data-qf]');
    function syncSections() { sections.forEach((s) => s.classList.toggle('hidden', s.dataset.qf !== form.quiz_type.value)); }
    form.quiz_type.addEventListener('change', syncSections);
    syncSections();

    let hsState = null;
    const hsImgInput = form.querySelector('[name="hs_image"]');
    const hsEditor = form.querySelector('[data-hs-editor]');
    const hsStatus = form.querySelector('[data-hs-status]');
    hsImgInput.addEventListener('change', async () => {
      const file = hsImgInput.files[0];
      if (!file) return;
      hsStatus.textContent = 'กำลังอัปโหลด...';
      try {
        const url = await uploadFile(file);
        hsState = { image_url: url, x: null, y: null };
        hsEditor.innerHTML = `<img src="${API}${url}" crossorigin="anonymous">`;
        const img = hsEditor.querySelector('img');
        img.addEventListener('click', (ev) => {
          const rect = img.getBoundingClientRect();
          const x = ((ev.clientX - rect.left) / rect.width) * 100;
          const y = ((ev.clientY - rect.top) / rect.height) * 100;
          hsState.x = x; hsState.y = y;
          hsEditor.querySelectorAll('.hotspot-marker').forEach((m) => m.remove());
          const marker = document.createElement('div');
          marker.className = 'hotspot-marker';
          marker.style.left = x + '%'; marker.style.top = y + '%';
          hsEditor.appendChild(marker);
          hsStatus.textContent = `กำหนดจุดแล้วที่ (${x.toFixed(1)}%, ${y.toFixed(1)}%)`;
        });
        hsStatus.textContent = 'อัปโหลดสำเร็จ — คลิกบนรูปเพื่อกำหนดจุดคำตอบที่ถูกต้อง';
      } catch (err) { hsStatus.textContent = err.message; }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-qform-msg]'); msg.classList.add('hidden');
      const type = form.quiz_type.value;
      let params = {};
      try {
        if (type === 'multiple_choice') {
          const options = form.mc_options.value.split('\n').map((s) => s.trim()).filter(Boolean);
          if (options.length < 2) throw new Error('กรุณาระบุตัวเลือกอย่างน้อย 2 ตัวเลือก');
          const correct = parseInt(form.mc_correct.value, 10) - 1;
          if (correct < 0 || correct >= options.length) throw new Error('ลำดับตัวเลือกที่ถูกต้องไม่ถูกต้อง');
          params = { options, correct_index: correct };
        } else if (type === 'short_answer') {
          const keywords = form.sa_keywords.value.split(',').map((s) => s.trim()).filter(Boolean);
          if (!keywords.length) throw new Error('กรุณาระบุคีย์เวิร์ดคำตอบอย่างน้อย 1 คำ');
          params = { keywords, case_sensitive: form.sa_case.checked };
        } else if (type === 'numeric') {
          if (form.num_target.value === '') throw new Error('กรุณาระบุคำตอบที่ถูกต้อง');
          params = { target: parseFloat(form.num_target.value), tolerance: parseFloat(form.num_tolerance.value || 0) };
        } else if (type === 'sequencing') {
          const items = form.seq_items.value.split('\n').map((s) => s.trim()).filter(Boolean);
          if (items.length < 2) throw new Error('กรุณาระบุขั้นตอนอย่างน้อย 2 ขั้นตอน');
          params = { items, correct_order: items.map((_, i) => i) };
        } else if (type === 'hotspot') {
          if (!hsState || hsState.x == null) throw new Error('กรุณาอัปโหลดรูปและคลิกกำหนดจุดคำตอบ');
          const w = 16, h = 16;
          const zx = Math.max(0, Math.min(100 - w, hsState.x - w / 2));
          const zy = Math.max(0, Math.min(100 - h, hsState.y - h / 2));
          params = { image_url: hsState.image_url, zones: [{ x: zx, y: zy, w, h }] };
        } else if (type === 'file_upload') {
          params = { accept: 'application/pdf', max_mb: parseInt(form.fu_max_mb.value, 10) || 10 };
        }
        await api(`/api/instructor/quizzes/${quizId}/questions`, {
          method: 'POST',
          body: JSON.stringify({ quiz_type: type, prompt: form.prompt.value.trim(), points: parseFloat(form.points.value) || 1, params }),
        });
        await renderQuizBody(quizId, scope);
      } catch (err) { msg.textContent = err.message; msg.classList.remove('hidden'); }
    });
  }

  async function renderGradingBody(quizId, body) {
    const subs = await api(`/api/instructor/quizzes/${quizId}/submissions`);
    body.innerHTML = subs.map((s) => `
      <div class="grading-row">
        <strong>${esc(s.full_name)}</strong> <span class="dim mono">(${esc(s.student_no || '-')})</span>
        — คะแนนรวม: <strong>${s.total_score}/${s.max_score}</strong>
        ${s.answers.filter((a) => a.quiz_type === 'file_upload').map((a) => `
          <div class="grading-file">
            <span>${esc(a.prompt)}</span>
            ${a.answer && a.answer.file_url ? `<a href="${API}${esc(a.answer.file_url)}" target="_blank" rel="noopener">ดูไฟล์ที่ส่ง</a>` : '<span class="dim">ยังไม่ส่งไฟล์</span>'}
            <span class="badge badge--${a.grading_state === 'graded' ? 'student' : 'admin'}">${a.grading_state}</span>
            <form data-grade="${a.submission_id}">
              <input type="number" name="score" step="0.5" min="0" max="${a.points}" placeholder="คะแนน (เต็ม ${a.points})" value="${a.score ?? ''}">
              <input type="text" name="feedback" placeholder="ความเห็น" value="${esc(a.feedback || '')}">
              <button class="btn btn--primary btn--sm" type="submit">บันทึก</button>
            </form>
          </div>`).join('')}
      </div>`).join('') || '<p class="empty-state">ยังไม่มีนักศึกษาส่งคำตอบ</p>';
    body.querySelectorAll('[data-grade]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      await api('/api/instructor/submissions/' + f.dataset.grade, {
        method: 'PATCH', body: JSON.stringify({ score: parseFloat(f.score.value), feedback: f.feedback.value.trim() || null }),
      });
      await renderGradingBody(quizId, body);
    }));
  }

  /* ================= STUDENT: CHAPTERS / QUIZ RUNNER ================= */
  async function renderStudentChapters(courseId, box) {
    const [chapters, progress] = await Promise.all([
      api(`/api/student/courses/${courseId}/chapters`),
      api(`/api/student/courses/${courseId}/progress`).catch(() => null),
    ]);
    if (!chapters.length) { box.innerHTML = '<p class="empty-state">คอร์สนี้ยังไม่มีบทเรียน</p>'; return; }
    const pct = progress ? progress.percent_complete : 0;
    box.innerHTML = `
      <div class="course-view">
        <aside class="course-sidebar">
          <div class="course-sidebar__progress-label">ความคืบหน้าคอร์ส</div>
          <div class="course-sidebar__progress-pct">${pct}%</div>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
          <nav class="chapter-nav">
            ${chapters.map((ch, i) => `
              <button class="chapter-nav-item" data-chapter-nav="${ch.id}" data-title="${esc(ch.title)}" type="button">
                <span class="chapter-nav-item__num">${String(i).padStart(2, '0')}</span>
                <span class="chapter-nav-item__title">${esc(ch.title)}</span>
              </button>`).join('')}
          </nav>
        </aside>
        <div class="course-content" id="courseContent-${courseId}"><p class="empty-state">เลือกบทเรียนทางซ้ายเพื่อเริ่มเรียน</p></div>
      </div>`;
    const contentBox = box.querySelector(`#courseContent-${courseId}`);
    const navBtns = box.querySelectorAll('[data-chapter-nav]');
    navBtns.forEach((b) => b.addEventListener('click', async () => {
      navBtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      contentBox.innerHTML = '<p class="dim small">กำลังโหลด...</p>';
      await renderStudentChapterBody(b.dataset.chapterNav, contentBox, b.dataset.title);
    }));
    if (navBtns.length) navBtns[0].click();
  }

  async function renderStudentChapterBody(chapterId, body, title) {
    const [materials, quizzes] = await Promise.all([
      api(`/api/student/chapters/${chapterId}/materials`),
      api(`/api/student/chapters/${chapterId}/quizzes`),
    ]);
    body.innerHTML = `
      ${title ? `<h3 class="course-content__title">${esc(title)}</h3>` : ''}
      <div class="sub-card">
        <h4>เนื้อหา</h4>
        ${materials.map((m) => studentMaterialHtml(m)).join('') || '<p class="empty-state">ยังไม่มีเนื้อหา</p>'}
      </div>
      <div class="sub-card">
        <h4>ควิซ</h4>
        ${quizzes.map((q) => `
          <div class="quiz-card">
            <div class="quiz-card__head">
              <strong>${esc(q.title)}</strong>
              <button class="btn btn--primary btn--sm" data-take-quiz="${q.id}" type="button">ทำควิซ</button>
            </div>
            <div class="quiz-card__body hidden" id="squiz-${q.id}"></div>
          </div>`).join('') || '<p class="empty-state">ยังไม่มีควิซในบทนี้</p>'}
      </div>`;
    body.querySelectorAll('[data-take-quiz]').forEach((b) => b.addEventListener('click', async () => {
      const qbody = body.querySelector('#squiz-' + b.dataset.takeQuiz);
      if (qbody.classList.contains('hidden')) await renderQuizRunner(b.dataset.takeQuiz, qbody);
      qbody.classList.toggle('hidden');
    }));
  }

  function studentMaterialHtml(m) {
    if (m.type === 'image' && m.file_url) return `<div class="material-item"><strong>${esc(m.title)}</strong><img src="${API}${esc(m.file_url)}"></div>`;
    if (m.type === 'audio' && m.file_url) return `<div class="material-item"><strong>${esc(m.title)}</strong><audio controls src="${API}${esc(m.file_url)}"></audio></div>`;
    return `<div class="material-item"><strong>${esc(m.title)}</strong>${m.body ? `<p>${esc(m.body)}</p>` : ''}</div>`;
  }

  async function renderQuizRunner(quizId, body) {
    const questions = await api(`/api/student/quizzes/${quizId}/questions`);
    body.innerHTML = `<div id="qrunner-${quizId}"></div><div id="qresult-${quizId}"></div>`;
    const runner = body.querySelector(`#qrunner-${quizId}`);
    runner.innerHTML = questions.map((q) => questionTakeHtml(q)).join('') +
      `<button class="btn btn--primary" data-submit-quiz="${quizId}" type="button">ส่งคำตอบทั้งหมด</button>`;
    questions.forEach((q) => wireQuestionTake(q, runner));
    runner.querySelector('[data-submit-quiz]').addEventListener('click', async function submitAll() {
      this.disabled = true; this.textContent = 'กำลังส่ง...';
      try {
        for (const q of questions) {
          let answer;
          if (q.quiz_type === 'file_upload') {
            const input = runner.querySelector(`[data-question="${q.id}"] input[type=file]`);
            const file = input.files[0];
            if (!file) continue;
            answer = { file_url: await uploadFile(file) };
          } else {
            answer = collectAnswer(q, runner);
          }
          if (answer == null) continue;
          await api(`/api/student/questions/${q.id}/submit`, { method: 'POST', body: JSON.stringify({ answer }) });
        }
        await renderQuizResult(quizId, body.querySelector(`#qresult-${quizId}`));
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการส่งคำตอบ: ' + err.message);
      } finally {
        this.disabled = false; this.textContent = 'ส่งคำตอบทั้งหมด';
      }
    });
  }

  function questionTakeHtml(q) {
    const p = q.params || {};
    let inner = '';
    if (q.quiz_type === 'multiple_choice') {
      inner = (p.options || []).map((opt, i) => `<label class="radio-field"><input type="radio" name="q${q.id}" value="${i}"> ${esc(opt)}</label>`).join('');
    } else if (q.quiz_type === 'short_answer') {
      inner = `<input type="text" name="q${q.id}" placeholder="พิมพ์คำตอบ">`;
    } else if (q.quiz_type === 'numeric') {
      inner = `<input type="number" step="any" name="q${q.id}" placeholder="พิมพ์ตัวเลขคำตอบ">`;
    } else if (q.quiz_type === 'sequencing') {
      inner = `<ol class="seq-list" data-seq="${q.id}">${(p.items || []).map((it) => `<li data-idx="${it.idx}"><span>${esc(it.text)}</span><span><button type="button" class="btn btn--ghost btn--sm" data-seq-up>▲</button> <button type="button" class="btn btn--ghost btn--sm" data-seq-down>▼</button></span></li>`).join('')}</ol>`;
    } else if (q.quiz_type === 'hotspot') {
      inner = `<div class="hotspot-editor" data-hs-take="${q.id}"><img src="${API}${esc(p.image_url)}" crossorigin="anonymous"></div><p class="hint-sm" data-hs-take-status>คลิกบนรูปเพื่อตอบ</p>`;
    } else if (q.quiz_type === 'file_upload') {
      inner = `<input type="file" name="q${q.id}" accept="${esc(p.accept || '*')}"> <span class="hint-sm">ขนาดไม่เกิน ${p.max_mb || '?'} MB</span>`;
    }
    return `<div class="quiz-take" data-question="${q.id}" data-qtype="${q.quiz_type}">
      <div><strong>${esc(q.prompt)}</strong> <span class="dim small">(${q.points} คะแนน)</span></div>
      <div class="field" style="margin-top:8px;">${inner}</div>
    </div>`;
  }

  function wireQuestionTake(q, runner) {
    const container = runner.querySelector(`[data-question="${q.id}"]`);
    if (q.quiz_type === 'sequencing') {
      const list = container.querySelector('[data-seq]');
      list.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        if (e.target.matches('[data-seq-up]') && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
        if (e.target.matches('[data-seq-down]') && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      });
    } else if (q.quiz_type === 'hotspot') {
      const editor = container.querySelector('[data-hs-take]');
      const status = container.querySelector('[data-hs-take-status]');
      const img = editor.querySelector('img');
      img.addEventListener('click', (ev) => {
        const rect = img.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 100;
        const y = ((ev.clientY - rect.top) / rect.height) * 100;
        editor.dataset.x = x; editor.dataset.y = y;
        editor.querySelectorAll('.hotspot-marker').forEach((m) => m.remove());
        const marker = document.createElement('div');
        marker.className = 'hotspot-marker'; marker.style.left = x + '%'; marker.style.top = y + '%';
        editor.appendChild(marker);
        status.textContent = `เลือกจุดแล้ว (${x.toFixed(1)}%, ${y.toFixed(1)}%)`;
      });
    }
  }

  function collectAnswer(q, runner) {
    const container = runner.querySelector(`[data-question="${q.id}"]`);
    if (q.quiz_type === 'multiple_choice') {
      const checked = container.querySelector(`input[name="q${q.id}"]:checked`);
      return checked ? { selected_index: parseInt(checked.value, 10) } : null;
    }
    if (q.quiz_type === 'short_answer') {
      const v = container.querySelector(`input[name="q${q.id}"]`).value.trim();
      return v ? { text: v } : null;
    }
    if (q.quiz_type === 'numeric') {
      const v = container.querySelector(`input[name="q${q.id}"]`).value;
      return v !== '' ? { value: parseFloat(v) } : null;
    }
    if (q.quiz_type === 'sequencing') {
      const order = Array.from(container.querySelectorAll('[data-seq] li')).map((li) => parseInt(li.dataset.idx, 10));
      return { order };
    }
    if (q.quiz_type === 'hotspot') {
      const editor = container.querySelector('[data-hs-take]');
      if (editor.dataset.x === undefined) return null;
      return { x: parseFloat(editor.dataset.x), y: parseFloat(editor.dataset.y) };
    }
    return null;
  }

  async function renderQuizResult(quizId, box) {
    const result = await api(`/api/student/quizzes/${quizId}/result`);
    box.innerHTML = `
      <div class="sub-card">
        <h4>ผลคะแนน: ${result.total_score} / ${result.max_score}</h4>
        ${result.items.map((it) => {
          const icon = it.grading_state === 'pending' ? '<span class="result-icon--pending">รอตรวจ</span>'
            : it.is_correct ? '<span class="result-icon--correct">✓ ถูกต้อง</span>' : '<span class="result-icon--wrong">✗ ไม่ถูกต้อง</span>';
          return `<div class="result-row"><span>${esc(it.prompt)}</span><span>${icon} ${it.score != null ? `(${it.score}/${it.points})` : `(เต็ม ${it.points})`}</span></div>`;
        }).join('')}
      </div>`;
  }
})();
