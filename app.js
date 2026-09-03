/*
  SkyLearn frontend — repaired complete version
  Replace your current paste.txt/app.js with this file.
  Important fixes:
  - No truncated/missing JavaScript sections
  - Safe DOM helpers so optional page elements do not crash the app
  - Safe URL handling for API upload URLs that may be relative or absolute
  - Fixes sequencing data so both string and object item formats work
  - Handles API/network errors gracefully
*/
(function () {
  'use strict';

  const API = 'https://skylearn.onrender.com';
  let TOKEN = '';
  let ME = null;

  const el = (id) => document.getElementById(id);
  const by = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const show = (id) => { const node = el(id); if (node) node.classList.remove('hidden'); };
  const hide = (id) => { const node = el(id); if (node) node.classList.add('hidden'); };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const safePct = (value) => Math.max(0, Math.min(100, num(value, 0)));

  function apiUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return API.replace(/\/$/, '') + '/' + String(path).replace(/^\//, '');
  }

  function setMessage(node, message, type = 'error') {
    if (!node) return;
    node.textContent = message || '';
    node.style.color = type === 'success' ? 'var(--color-success, #17803d)' : 'var(--color-danger, #b42318)';
    node.classList.toggle('hidden', !message);
  }

  async function api(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    if (!headers.has('Content-Type') && !(opts.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    if (TOKEN) headers.set('Authorization', `Bearer ${TOKEN}`);

    let response;
    try {
      response = await fetch(apiUrl(path), { ...opts, headers });
    } catch (_) {
      throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตและลองใหม่');
    }

    const contentType = response.headers.get('content-type') || '';
    let body = null;
    try {
      body = contentType.includes('application/json') ? await response.json() : await response.text();
    } catch (_) {
      body = null;
    }

    if (!response.ok) {
      const detail = body && typeof body === 'object' ? (body.detail || body.message) : body;
      throw new Error(detail || `HTTP ${response.status}`);
    }
    return body;
  }

  async function uploadFile(file) {
    if (!file) throw new Error('กรุณาเลือกไฟล์');
    const data = new FormData();
    data.append('file', file);
    const result = await api('/api/upload', { method: 'POST', body: data });
    if (!result || !result.url) throw new Error('เซิร์ฟเวอร์ไม่ส่ง URL ของไฟล์กลับมา');
    return result.url;
  }

  function gradeBadge(grade) {
    const label = grade || '—';
    const css = String(grade || 'none').replace(/[^a-zA-Z0-9_-]/g, '');
    return `<span class="grade-badge grade-badge--${css}">${esc(label)}</span>`;
  }

  function progressBlockHtml(progress) {
    const pct = safePct(progress?.percent_complete);
    const missing = Array.isArray(progress?.missing_quizzes) ? progress.missing_quizzes : [];
    const score = progress?.percent_score;
    const scoreLine = score != null
      ? `<span class="dim">คะแนนรวม ${esc(progress.total_score)}/${esc(progress.total_max)} (${esc(score)}%)</span> ${gradeBadge(progress.grade)}`
      : '<span class="dim">ยังไม่มีควิซที่ตรวจให้คะแนนแล้ว</span>';
    const missingHtml = missing.length
      ? `<ul class="missing-quiz-list">${missing.map((item) => `<li>${esc(item.chapter_title)} — ${esc(item.quiz_title)}</li>`).join('')}</ul>`
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

  function bindLogin() {
    const form = el('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      hide('loginError');
      const submit = by('[type="submit"]', form);
      if (submit) submit.disabled = true;
      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: el('loginEmail')?.value.trim() || '',
            password: el('loginPassword')?.value || ''
          })
        });
        TOKEN = data.token || '';
        ME = { full_name: data.full_name || '', role: data.role || '' };
        if (!TOKEN || !ME.role) throw new Error('ข้อมูลเข้าสู่ระบบจากเซิร์ฟเวอร์ไม่ครบ');
        enterApp();
      } catch (error) {
        setMessage(el('loginError'), error.message);
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    const logout = el('logoutBtn');
    if (logout) {
      logout.addEventListener('click', () => {
        TOKEN = '';
        ME = null;
        hide('appView');
        show('loginView');
        form.reset();
      });
    }
  }

  function enterApp() {
    hide('loginView');
    show('appView');
    if (el('userName')) el('userName').textContent = ME?.full_name || '';
    if (el('userRoleBadge')) {
      el('userRoleBadge').textContent = ME?.role || '';
      el('userRoleBadge').className = `badge badge--${ME?.role || 'none'}`;
    }

    ['adminPanel', 'instructorPanel', 'studentPanel'].forEach(hide);
    if (ME?.role === 'admin') {
      show('adminPanel');
      loadAdmin().catch((error) => console.error(error));
    } else if (ME?.role === 'instructor') {
      show('instructorPanel');
      loadInstructor().catch((error) => console.error(error));
    } else if (ME?.role === 'student') {
      show('studentPanel');
      loadStudent().catch((error) => console.error(error));
    }
  }

  function bindAdmin() {
    const role = el('acRole');
    if (role) {
      const syncStudentId = () => {
        const field = el('acStudentIdField');
        if (field) field.style.display = role.value === 'student' ? '' : 'none';
      };
      role.addEventListener('change', syncStudentId);
      syncStudentId();
    }

    const form = el('adminCreateForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage(el('adminCreateMsg'), '');
      try {
        await api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            email: el('acEmail')?.value.trim() || '',
            password: el('acPassword')?.value || '',
            full_name: el('acName')?.value.trim() || '',
            role: el('acRole')?.value || 'student',
            student_id: el('acRole')?.value === 'student' ? (el('acStudentId')?.value.trim() || null) : null
          })
        });
        form.reset();
        setMessage(el('adminCreateMsg'), 'สร้างผู้ใช้สำเร็จ', 'success');
        await loadAdmin();
      } catch (error) {
        setMessage(el('adminCreateMsg'), error.message);
      }
    });
  }

  async function loadAdmin() {
    const userRows = el('adminUserRows');
    if (!userRows) return;

    try {
      const users = await api('/api/admin/users');
      userRows.innerHTML = (Array.isArray(users) ? users : []).map((user) => `
        <tr>
          <td>${esc(user.full_name)}</td>
          <td class="mono">${esc(user.email)}</td>
          <td><span class="badge badge--${esc(user.role)}">${esc(user.role)}</span></td>
          <td class="mono">${esc(user.student_id || '-')}</td>
          <td>${user.is_active ? 'ใช้งานอยู่' : '<span class="dim">ปิดใช้งาน</span>'}</td>
          <td>
            <button class="btn btn--ghost btn--sm" data-toggle-user="${esc(user.id)}" data-active="${Boolean(user.is_active)}" type="button">${user.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
            <button class="btn btn--danger btn--sm" data-delete-user="${esc(user.id)}" type="button">ลบ</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty-state">ยังไม่มีผู้ใช้</td></tr>';

      all('[data-toggle-user]', userRows).forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await api(`/api/admin/users/${button.dataset.toggleUser}`, {
              method: 'PATCH',
              body: JSON.stringify({ is_active: button.dataset.active !== 'true' })
            });
            await loadAdmin();
          } catch (error) {
            alert(error.message);
          }
        });
      });

      all('[data-delete-user]', userRows).forEach((button) => {
        button.addEventListener('click', async () => {
          if (!confirm('ลบผู้ใช้นี้ถาวร?')) return;
          try {
            await api(`/api/admin/users/${button.dataset.deleteUser}`, { method: 'DELETE' });
            await loadAdmin();
          } catch (error) {
            alert(error.message);
          }
        });
      });
    } catch (error) {
      userRows.innerHTML = `<tr><td colspan="6" class="empty-state">โหลดผู้ใช้ไม่สำเร็จ: ${esc(error.message)}</td></tr>`;
    }

    const dashboard = el('adminDashboard');
    if (!dashboard) return;
    try {
      const courses = await api('/api/admin/dashboard');
      dashboard.innerHTML = (Array.isArray(courses) ? courses : []).map((course) => `
        <div class="dash-course-block">
          <h3>${esc(course.course_title)}</h3>
          <div class="dash-course-stats">นักศึกษา ${esc(course.student_count)} คน · ความคืบหน้าเฉลี่ย ${esc(course.avg_complete)}% · คะแนนเฉลี่ย ${course.avg_score != null ? `${esc(course.avg_score)}%` : '—'}</div>
          ${(Array.isArray(course.students) ? course.students : []).map((student) => `
            <div class="dash-student-block">
              <div class="dash-student-head"><span>${esc(student.full_name)} <span class="dim small">(${esc(student.student_code || '-')})</span></span>${gradeBadge(student.grade)}</div>
              <div class="dash-bar-row-line">
                <span class="dash-label">ความคืบหน้า</span>
                <div class="dash-bar-track"><div class="dash-bar-fill--complete" style="width:${safePct(student.percent_complete)}%;"></div></div>
                <span class="dash-value">${esc(student.percent_complete)}%</span>
              </div>
              <div class="dash-bar-row-line">
                <span class="dash-label">คะแนน</span>
                <div class="dash-bar-track"><div class="dash-bar-fill--score" style="width:${safePct(student.percent_score)}%;"></div></div>
                <span class="dash-value">${student.percent_score != null ? `${esc(student.percent_score)}%` : '—'}</span>
              </div>
            </div>`).join('') || '<p class="empty-state">ยังไม่มีนักศึกษาในคอร์สนี้</p>'}
        </div>`).join('') || '<p class="empty-state">ยังไม่มีคอร์ส</p>';
    } catch (error) {
      dashboard.innerHTML = `<p class="dim small">โหลดแดชบอร์ดไม่สำเร็จ: ${esc(error.message)}</p>`;
    }
  }

  function bindInstructorForms() {
    const studentForm = el('createStudentForm');
    if (studentForm) {
      studentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = el('createStudentMsg');
        setMessage(message, '');
        try {
          await api('/api/instructor/students', {
            method: 'POST',
            body: JSON.stringify({
              email: el('csEmail')?.value.trim() || '',
              password: el('csPassword')?.value || '',
              full_name: el('csName')?.value.trim() || '',
              student_id: el('csStudentId')?.value.trim() || ''
            })
          });
          studentForm.reset();
          setMessage(message, 'สร้างบัญชีนักศึกษาสำเร็จ — เพิ่มสิทธิ์เข้าคอร์สด้วย Whitelist ได้ด้านล่าง', 'success');
        } catch (error) {
          setMessage(message, error.message);
        }
      });
    }

    const courseForm = el('createCourseForm');
    if (courseForm) {
      courseForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = el('createCourseMsg');
        setMessage(message, '');
        try {
          await api('/api/instructor/courses', {
            method: 'POST',
            body: JSON.stringify({
              slug: el('ccSlug')?.value.trim() || '',
              title: el('ccTitle')?.value.trim() || '',
              description: el('ccDescription')?.value.trim() || null,
              course_url: el('ccUrl')?.value.trim() || null
            })
          });
          courseForm.reset();
          setMessage(message, 'สร้างคอร์สสำเร็จ', 'success');
          await loadInstructor();
        } catch (error) {
          setMessage(message, error.message);
        }
      });
    }
  }

  async function downloadGrades(courseId, slugHint) {
    try {
      const response = await fetch(apiUrl(`/api/instructor/courses/${courseId}/grades/export`), {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
      });
      if (!response.ok) throw new Error('ดาวน์โหลดคะแนนไม่สำเร็จ');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `grades_${slugHint || courseId}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      alert(error.message);
    }
  }

  function gradesTableHtml(rows) {
    if (!Array.isArray(rows) || !rows.length) return '<p class="empty-state">ยังไม่มีนักศึกษาในคอร์สนี้</p>';
    return `<table>
      <thead><tr><th>ชื่อ</th><th>รหัสนักศึกษา</th><th>ความคืบหน้า</th><th>คะแนน</th><th>เกรด</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${esc(row.full_name)}</td>
          <td class="mono">${esc(row.student_code || row.student_id || '-')}</td>
          <td>${esc(row.percent_complete)}% <span class="dim small">(${esc(row.completed_quizzes)}/${esc(row.total_quizzes)})</span></td>
          <td>${row.percent_score != null ? `${esc(row.total_score)}/${esc(row.total_max)} (${esc(row.percent_score)}%)` : '<span class="dim">—</span>'}</td>
          <td>${gradeBadge(row.grade)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  async function loadInstructor() {
    const container = el('instructorCourses');
    if (!container) return;

    try {
      const courses = await api('/api/instructor/courses');
      const blocks = await Promise.all((Array.isArray(courses) ? courses : []).map(async (course) => {
        let roster = [];
        try { roster = await api(`/api/instructor/courses/${course.id}/students`); } catch (_) { roster = []; }
        return `
          <div class="card">
            <h2>${esc(course.title)}</h2>
            <form class="inline-form" data-whitelist="${esc(course.id)}">
              <div class="field"><label>รหัสนักศึกษาที่ต้องการให้สิทธิ์</label><input type="text" name="student_id" required></div>
              <button class="btn btn--primary" type="submit">เพิ่มสิทธิ์ (Whitelist)</button>
            </form>
            <p class="error-msg hidden" data-msg="${esc(course.id)}"></p>
            <table>
              <thead><tr><th>ชื่อ</th><th>รหัสนักศึกษา</th><th></th></tr></thead>
              <tbody>${(Array.isArray(roster) ? roster : []).map((student) => `
                <tr><td>${esc(student.full_name)}</td><td class="mono">${esc(student.student_id || student.student_code)}</td>
                <td><button class="btn btn--danger btn--sm" data-revoke="${esc(course.id)}:${esc(student.id)}" type="button">เพิกถอน</button></td></tr>`).join('') || '<tr><td colspan="3" class="empty-state">ยังไม่มีนักศึกษาได้รับสิทธิ์</td></tr>'}
              </tbody>
            </table>
            <button class="btn btn--ghost btn--sm" data-toggle-chapmgr="${esc(course.id)}" type="button">จัดการบทเรียนและควิซ</button>
            <div class="hidden" id="chapterMgr-${esc(course.id)}" style="margin-top:var(--space-4);"></div>
            <div class="sub-card" style="margin-top:var(--space-4);">
              <div class="grades-toolbar">
                <h4 style="margin:0;">สรุปคะแนนนักศึกษา</h4>
                <button class="btn btn--ghost btn--sm" data-export-grades="${esc(course.id)}" data-slug="${esc(course.slug || course.id)}" type="button">⬇️ ดาวน์โหลดคะแนน (Excel)</button>
              </div>
              <div id="gradesTable-${esc(course.id)}"><p class="dim small">กำลังโหลดคะแนน...</p></div>
            </div>
          </div>`;
      }));

      container.innerHTML = blocks.join('') || '<p class="empty-state">คุณยังไม่มีคอร์สที่รับผิดชอบ</p>';

      all('[data-toggle-chapmgr]', container).forEach((button) => {
        button.addEventListener('click', async () => {
          const courseId = button.dataset.toggleChapmgr;
          const box = el(`chapterMgr-${courseId}`);
          if (!box) return;
          try {
            if (box.classList.contains('hidden') && !box.dataset.loaded) {
              await renderChapterManager(courseId, box);
              box.dataset.loaded = '1';
            }
            box.classList.toggle('hidden');
            button.textContent = box.classList.contains('hidden') ? 'จัดการบทเรียนและควิซ' : 'ซ่อนบทเรียนและควิซ';
          } catch (error) {
            alert(error.message);
          }
        });
      });

      all('form[data-whitelist]', container).forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const courseId = form.dataset.whitelist;
          const message = by(`[data-msg="${CSS.escape(courseId)}"]`, container);
          setMessage(message, '');
          try {
            await api(`/api/instructor/courses/${courseId}/enrollments`, {
              method: 'POST',
              body: JSON.stringify({ student_id: form.elements.student_id.value.trim() })
            });
            await loadInstructor();
          } catch (error) {
            setMessage(message, error.message);
          }
        });
      });

      all('[data-revoke]', container).forEach((button) => {
        button.addEventListener('click', async () => {
          const [courseId, userId] = button.dataset.revoke.split(':');
          try {
            await api(`/api/instructor/courses/${courseId}/enrollments/${userId}`, { method: 'DELETE' });
            await loadInstructor();
          } catch (error) {
            alert(error.message);
          }
        });
      });

      all('[data-export-grades]', container).forEach((button) => {
        button.addEventListener('click', () => downloadGrades(button.dataset.exportGrades, button.dataset.slug));
      });

      (Array.isArray(courses) ? courses : []).forEach(async (course) => {
        const box = el(`gradesTable-${course.id}`);
        if (!box) return;
        try {
          const rows = await api(`/api/instructor/courses/${course.id}/grades`);
          box.innerHTML = gradesTableHtml(rows);
        } catch (error) {
          box.innerHTML = `<p class="dim small">โหลดคะแนนไม่สำเร็จ: ${esc(error.message)}</p>`;
        }
      });
    } catch (error) {
      container.innerHTML = `<p class="empty-state">โหลดคอร์สไม่สำเร็จ: ${esc(error.message)}</p>`;
    }
  }

  const QTYPE_LABELS = {
    multiple_choice: 'ปรนัย (เลือกตอบ)',
    short_answer: 'เติมคำตอบสั้น',
    numeric: 'ตัวเลข (มีค่าคลาดเคลื่อน)',
    sequencing: 'เรียงลำดับขั้นตอน',
    hotspot: 'คลิกจุดในภาพ',
    file_upload: 'แนบไฟล์'
  };

  async function renderChapterManager(courseId, box) {
    const chapters = await api(`/api/instructor/courses/${courseId}/chapters`);
    const items = Array.isArray(chapters) ? chapters : [];
    box.innerHTML = `
      <div class="sub-card">
        ${items.map(chapterCardHtml).join('') || '<p class="empty-state">ยังไม่มีบทเรียน</p>'}
        <form class="inline-form" data-add-chapter="${esc(courseId)}">
          <div class="field"><label>เพิ่มบทใหม่</label><input name="title" placeholder="เช่น บทที่ 1: พื้นฐาน K-Factor" required></div>
          <button class="btn btn--primary btn--sm" type="submit">เพิ่มบท</button>
        </form>
      </div>`;

    by('[data-add-chapter]', box)?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api(`/api/instructor/courses/${courseId}/chapters`, {
          method: 'POST',
          body: JSON.stringify({ title: event.target.elements.title.value.trim() })
        });
        await renderChapterManager(courseId, box);
      } catch (error) {
        alert(error.message);
      }
    });

    all('[data-del-chapter]', box).forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('ลบบทนี้ถาวร รวมทั้งเนื้อหาและควิซทั้งหมดในบท?')) return;
        try {
          await api(`/api/instructor/chapters/${button.dataset.delChapter}`, { method: 'DELETE' });
          await renderChapterManager(courseId, box);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    all('[data-toggle-chapter]', box).forEach((button) => {
      button.addEventListener('click', async () => {
        const chapterId = button.dataset.toggleChapter;
        const body = el(`chapterBody-${chapterId}`);
        if (!body) return;
        try {
          if (body.classList.contains('hidden') && !body.dataset.loaded) {
            await renderChapterBody(chapterId, body);
            body.dataset.loaded = '1';
          }
          body.classList.toggle('hidden');
        } catch (error) {
          alert(error.message);
        }
      });
    });
  }

  function chapterCardHtml(chapter) {
    return `
      <div class="chapter-card">
        <div class="chapter-card__head">
          <strong>${esc(chapter.title)}</strong>
          <div>
            <button class="btn btn--ghost btn--sm" data-toggle-chapter="${esc(chapter.id)}" type="button">เนื้อหา &amp; ควิซ</button>
            <button class="btn btn--danger btn--sm" data-del-chapter="${esc(chapter.id)}" type="button">ลบบท</button>
          </div>
        </div>
        <div class="chapter-card__body hidden" id="chapterBody-${esc(chapter.id)}"></div>
      </div>`;
  }

  function materialRowHtml(material) {
    const label = { text: 'ข้อความ', image: 'รูปภาพ', audio: 'เสียง' }[material.type] || material.type;
    return `<div class="material-row">
      <div><span class="badge--qtype">${esc(label)}</span> <strong>${esc(material.title)}</strong>${material.body ? `<div class="dim small">${esc(material.body)}</div>` : ''}${material.file_url ? `<div class="dim small mono">${esc(material.file_url)}</div>` : ''}</div>
      <button class="btn btn--danger btn--sm" data-del-material="${esc(material.id)}" type="button">ลบ</button>
    </div>`;
  }

  function quizCardHtml(quiz) {
    return `
      <div class="quiz-card">
        <div class="quiz-card__head">
          <strong>${esc(quiz.title)}</strong>
          <div>
            <button class="btn btn--ghost btn--sm" data-toggle-quiz="${esc(quiz.id)}" type="button">คำถาม</button>
            <button class="btn btn--ghost btn--sm" data-toggle-grading="${esc(quiz.id)}" type="button">ตรวจ/คะแนน</button>
            <button class="btn btn--danger btn--sm" data-del-quiz="${esc(quiz.id)}" type="button">ลบควิซ</button>
          </div>
        </div>
        <div class="quiz-card__body hidden" id="quizBody-${esc(quiz.id)}"></div>
        <div class="quiz-card__body hidden" id="gradingBody-${esc(quiz.id)}"></div>
      </div>`;
  }

  async function renderChapterBody(chapterId, body) {
    const [materials, quizzes] = await Promise.all([
      api(`/api/instructor/chapters/${chapterId}/materials`),
      api(`/api/instructor/chapters/${chapterId}/quizzes`)
    ]);
    const materialItems = Array.isArray(materials) ? materials : [];
    const quizItems = Array.isArray(quizzes) ? quizzes : [];

    body.innerHTML = `
      <div class="sub-card">
        <h4>เนื้อหาในบทนี้</h4>
        ${materialItems.map(materialRowHtml).join('') || '<p class="empty-state">ยังไม่มีเนื้อหา</p>'}
        <form class="inline-form" data-add-material="${esc(chapterId)}">
          <div class="field"><label>ประเภท</label>
            <select name="type"><option value="text">ข้อความ</option><option value="image">รูปภาพ</option><option value="audio">เสียง</option></select>
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
        ${quizItems.map(quizCardHtml).join('') || '<p class="empty-state">ยังไม่มีควิซ</p>'}
        <form class="inline-form" data-add-quiz="${esc(chapterId)}">
          <div class="field"><label>ชื่อควิซใหม่</label><input name="title" placeholder="เช่น ควิซท้ายบท" required></div>
          <button class="btn btn--primary btn--sm" type="submit">สร้างควิซ</button>
        </form>
      </div>`;

    const materialForm = by('[data-add-material]', body);
    const materialMessage = by('[data-mat-msg]', body);
    if (materialForm) {
      const typeSelect = materialForm.elements.type;
      const syncMaterialFields = () => {
        const isText = typeSelect.value === 'text';
        by('.mat-body-field', materialForm)?.classList.toggle('hidden', !isText);
        by('.mat-file-field', materialForm)?.classList.toggle('hidden', isText);
      };
      typeSelect.addEventListener('change', syncMaterialFields);
      syncMaterialFields();

      materialForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMessage(materialMessage, '');
        try {
          let fileUrl = null;
          if (materialForm.elements.type.value !== 'text') {
            fileUrl = await uploadFile(materialForm.elements.file.files[0]);
          }
          await api(`/api/instructor/chapters/${chapterId}/materials`, {
            method: 'POST',
            body: JSON.stringify({
              type: materialForm.elements.type.value,
              title: materialForm.elements.title.value.trim(),
              body: materialForm.elements.body.value.trim() || null,
              file_url: fileUrl
            })
          });
          await renderChapterBody(chapterId, body);
        } catch (error) {
          setMessage(materialMessage, error.message);
        }
      });
    }

    all('[data-del-material]', body).forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await api(`/api/instructor/materials/${button.dataset.delMaterial}`, { method: 'DELETE' });
          await renderChapterBody(chapterId, body);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    by('[data-add-quiz]', body)?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api(`/api/instructor/chapters/${chapterId}/quizzes`, {
          method: 'POST',
          body: JSON.stringify({ title: event.target.elements.title.value.trim() })
        });
        await renderChapterBody(chapterId, body);
      } catch (error) {
        alert(error.message);
      }
    });

    all('[data-del-quiz]', body).forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('ลบควิซนี้ถาวร?')) return;
        try {
          await api(`/api/instructor/quizzes/${button.dataset.delQuiz}`, { method: 'DELETE' });
          await renderChapterBody(chapterId, body);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    all('[data-toggle-quiz]', body).forEach((button) => {
      button.addEventListener('click', async () => {
        const quizId = button.dataset.toggleQuiz;
        const quizBody = el(`quizBody-${quizId}`);
        if (!quizBody) return;
        try {
          if (quizBody.classList.contains('hidden') && !quizBody.dataset.loaded) {
            await renderQuizBody(quizId, quizBody);
            quizBody.dataset.loaded = '1';
          }
          quizBody.classList.toggle('hidden');
        } catch (error) {
          alert(error.message);
        }
      });
    });

    all('[data-toggle-grading]', body).forEach((button) => {
      button.addEventListener('click', async () => {
        const quizId = button.dataset.toggleGrading;
        const gradingBody = el(`gradingBody-${quizId}`);
        if (!gradingBody) return;
        try {
          if (gradingBody.classList.contains('hidden')) await renderGradingBody(quizId, gradingBody);
          gradingBody.classList.toggle('hidden');
        } catch (error) {
          alert(error.message);
        }
      });
    });
  }

  function questionRowHtml(question) {
    const params = question.params || {};
    let detail = '';
    if (question.quiz_type === 'multiple_choice') detail = `ตัวเลือก: ${(params.options || []).join(' / ')} — เฉลย: ${(params.options || [])[params.correct_index] || '-'}`;
    if (question.quiz_type === 'short_answer') detail = `คีย์เวิร์ด: ${(params.keywords || []).join(', ')}`;
    if (question.quiz_type === 'numeric') detail = `เฉลย: ${params.target} ± ${params.tolerance}`;
    if (question.quiz_type === 'sequencing') detail = `ลำดับที่ถูก: ${normalizeSequence(params.items).map((item) => item.text).join(' → ')}`;
    if (question.quiz_type === 'hotspot') detail = `รูป: ${params.image_url || '-'}`;
    if (question.quiz_type === 'file_upload') detail = `รับไฟล์สูงสุด ${params.max_mb || '-'} MB`;

    return `<div class="question-row">
      <div><span class="badge--qtype">${esc(QTYPE_LABELS[question.quiz_type] || question.quiz_type)}</span><strong> ${esc(question.prompt)}</strong> (${esc(question.points)} คะแนน)
      <div class="dim small">${esc(detail)}</div></div>
      <button class="btn btn--danger btn--sm" data-del-question="${esc(question.id)}" type="button">ลบ</button>
    </div>`;
  }

  function questionFormHtml(quizId) {
    return `
      <form class="question-form" data-add-question="${esc(quizId)}">
        <div class="field"><label>คำถาม</label><input name="prompt" required></div>
        <div class="inline-form">
          <div class="field"><label>คะแนนเต็ม</label><input name="points" type="number" step="0.5" min="0.5" value="1" required></div>
          <div class="field"><label>ประเภทคำถาม</label>
            <select name="quiz_type" class="qtype-select">${Object.entries(QTYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
          </div>
        </div>
        <div data-qf="multiple_choice">
          <div class="field"><label>ตัวเลือก (บรรทัดละ 1 ตัวเลือก อย่างน้อย 2 ตัวเลือก)</label><textarea name="mc_options" rows="3"></textarea></div>
          <div class="field"><label>ลำดับตัวเลือกที่ถูกต้อง (เริ่มนับที่ 1)</label><input name="mc_correct" type="number" min="1" value="1"></div>
        </div>
        <div data-qf="short_answer" class="hidden">
          <div class="field"><label>คีย์เวิร์ดคำตอบที่ถูกต้อง (คั่นด้วย ,)</label><input name="sa_keywords" placeholder="เช่น bend allowance, bend deduction"></div>
          <label class="checkbox-field"><input type="checkbox" name="sa_case"> ตรวจตัวพิมพ์ใหญ่-เล็ก</label>
        </div>
        <div data-qf="numeric" class="hidden">
          <div class="inline-form">
            <div class="field"><label>คำตอบที่ถูกต้อง</label><input name="num_target" type="number" step="any"></div>
            <div class="field"><label>ค่าคลาดเคลื่อนที่ยอมรับ (±)</label><input name="num_tolerance" type="number" step="any" value="0"></div>
          </div>
        </div>
        <div data-qf="sequencing" class="hidden">
          <div class="field"><label>ขั้นตอนตามลำดับที่ถูกต้อง (บรรทัดละ 1 ขั้นตอน)</label><textarea name="seq_items" rows="3"></textarea></div>
        </div>
        <div data-qf="hotspot" class="hidden">
          <div class="field"><label>อัปโหลดรูปภาพ แล้วคลิกกำหนดจุดคำตอบ</label><input type="file" name="hs_image" accept="image/*"></div>
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

  async function renderQuizBody(quizId, body) {
    const questions = await api(`/api/instructor/quizzes/${quizId}/questions`);
    const items = Array.isArray(questions) ? questions : [];
    body.innerHTML = `${items.map(questionRowHtml).join('') || '<p class="empty-state">ยังไม่มีคำถาม</p>'}${questionFormHtml(quizId)}`;

    all('[data-del-question]', body).forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          await api(`/api/instructor/questions/${button.dataset.delQuestion}`, { method: 'DELETE' });
          await renderQuizBody(quizId, body);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    const form = by('[data-add-question]', body);
    if (form) wireQuestionForm(form, quizId, body);
  }

  function wireQuestionForm(form, quizId, scope) {
    const sections = all('[data-qf]', form);
    const typeSelect = form.elements.quiz_type;
    const syncSections = () => sections.forEach((section) => section.classList.toggle('hidden', section.dataset.qf !== typeSelect.value));
    typeSelect.addEventListener('change', syncSections);
    syncSections();

    let hotspot = null;
    const imageInput = form.elements.hs_image;
    const editor = by('[data-hs-editor]', form);
    const status = by('[data-hs-status]', form);

    imageInput?.addEventListener('change', async () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      status.textContent = 'กำลังอัปโหลด...';
      try {
        const imageUrl = await uploadFile(file);
        hotspot = { image_url: imageUrl, x: null, y: null };
        editor.innerHTML = `<img src="${esc(apiUrl(imageUrl))}" alt="Hotspot image">`;
        const image = by('img', editor);
        image.addEventListener('click', (event) => {
          const rect = image.getBoundingClientRect();
          hotspot.x = ((event.clientX - rect.left) / rect.width) * 100;
          hotspot.y = ((event.clientY - rect.top) / rect.height) * 100;
          all('.hotspot-marker', editor).forEach((marker) => marker.remove());
          const marker = document.createElement('div');
          marker.className = 'hotspot-marker';
          marker.style.left = `${hotspot.x}%`;
          marker.style.top = `${hotspot.y}%`;
          editor.appendChild(marker);
          status.textContent = `กำหนดจุดแล้วที่ (${hotspot.x.toFixed(1)}%, ${hotspot.y.toFixed(1)}%)`;
        });
        status.textContent = 'อัปโหลดสำเร็จ — คลิกบนรูปเพื่อกำหนดจุดคำตอบ';
      } catch (error) {
        status.textContent = error.message;
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = by('[data-qform-msg]', form);
      setMessage(message, '');
      const type = typeSelect.value;
      let params;

      try {
        if (type === 'multiple_choice') {
          const options = form.elements.mc_options.value.split('\n').map((value) => value.trim()).filter(Boolean);
          const correctIndex = parseInt(form.elements.mc_correct.value, 10) - 1;
          if (options.length < 2) throw new Error('กรุณาระบุตัวเลือกอย่างน้อย 2 ตัวเลือก');
          if (correctIndex < 0 || correctIndex >= options.length) throw new Error('ลำดับตัวเลือกที่ถูกต้องไม่ถูกต้อง');
          params = { options, correct_index: correctIndex };
        } else if (type === 'short_answer') {
          const keywords = form.elements.sa_keywords.value.split(',').map((value) => value.trim()).filter(Boolean);
          if (!keywords.length) throw new Error('กรุณาระบุคีย์เวิร์ดคำตอบอย่างน้อย 1 คำ');
          params = { keywords, case_sensitive: form.elements.sa_case.checked };
        } else if (type === 'numeric') {
          if (form.elements.num_target.value === '') throw new Error('กรุณาระบุคำตอบที่ถูกต้อง');
          params = { target: num(form.elements.num_target.value), tolerance: Math.max(0, num(form.elements.num_tolerance.value)) };
        } else if (type === 'sequencing') {
          const items = form.elements.seq_items.value.split('\n').map((value) => value.trim()).filter(Boolean);
          if (items.length < 2) throw new Error('กรุณาระบุขั้นตอนอย่างน้อย 2 ขั้นตอน');
          params = { items, correct_order: items.map((_, index) => index) };
        } else if (type === 'hotspot') {
          if (!hotspot || hotspot.x == null || hotspot.y == null) throw new Error('กรุณาอัปโหลดรูปและคลิกกำหนดจุดคำตอบ');
          const width = 16;
          const height = 16;
          params = {
            image_url: hotspot.image_url,
            zones: [{
              x: Math.max(0, Math.min(100 - width, hotspot.x - width / 2)),
              y: Math.max(0, Math.min(100 - height, hotspot.y - height / 2)),
              w: width,
              h: height
            }]
          };
        } else {
          params = { accept: 'application/pdf', max_mb: Math.max(1, parseInt(form.elements.fu_max_mb.value, 10) || 10) };
        }

        await api(`/api/instructor/quizzes/${quizId}/questions`, {
          method: 'POST',
          body: JSON.stringify({
            quiz_type: type,
            prompt: form.elements.prompt.value.trim(),
            points: Math.max(0.5, num(form.elements.points.value, 1)),
            params
          })
        });
        await renderQuizBody(quizId, scope);
      } catch (error) {
        setMessage(message, error.message);
      }
    });
  }

  async function renderGradingBody(quizId, body) {
    const submissions = await api(`/api/instructor/quizzes/${quizId}/submissions`);
    const items = Array.isArray(submissions) ? submissions : [];
    body.innerHTML = items.map((submission) => `
      <div class="grading-row">
        <strong>${esc(submission.full_name)}</strong> <span class="dim mono">(${esc(submission.student_no || submission.student_id || '-')})</span>
        — คะแนนรวม: <strong>${esc(submission.total_score)}/${esc(submission.max_score)}</strong>
        ${(Array.isArray(submission.answers) ? submission.answers : []).filter((answer) => answer.quiz_type === 'file_upload').map((answer) => `
          <div class="grading-file">
            <span>${esc(answer.prompt)}</span>
            ${answer.answer?.file_url ? `<a href="${esc(apiUrl(answer.answer.file_url))}" target="_blank" rel="noopener">ดูไฟล์ที่ส่ง</a>` : '<span class="dim">ยังไม่ส่งไฟล์</span>'}
            <span class="badge badge--${answer.grading_state === 'graded' ? 'student' : 'admin'}">${esc(answer.grading_state)}</span>
            <form data-grade="${esc(answer.submission_id)}">
              <input type="number" name="score" step="0.5" min="0" max="${esc(answer.points)}" placeholder="คะแนน (เต็ม ${esc(answer.points)})" value="${answer.score ?? ''}">
              <input type="text" name="feedback" placeholder="ความเห็น" value="${esc(answer.feedback || '')}">
              <button class="btn btn--primary btn--sm" type="submit">บันทึก</button>
            </form>
          </div>`).join('')}
      </div>`).join('') || '<p class="empty-state">ยังไม่มีนักศึกษาส่งคำตอบ</p>';

    all('[data-grade]', body).forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await api(`/api/instructor/submissions/${form.dataset.grade}`, {
            method: 'PATCH',
            body: JSON.stringify({ score: num(form.elements.score.value), feedback: form.elements.feedback.value.trim() || null })
          });
          await renderGradingBody(quizId, body);
        } catch (error) {
          alert(error.message);
        }
      });
    });
  }

  async function loadStudent() {
    const container = el('studentCourseList');
    if (!container) return;

    try {
      const courses = await api('/api/student/courses');
      const items = Array.isArray(courses) ? courses : [];
      container.innerHTML = items.map((course) => `
        <div class="course-tile" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:var(--space-4);flex-wrap:wrap;">
            <div><div class="course-tile__title">${esc(course.title)}</div><div class="course-tile__desc">${esc(course.description || '')}</div></div>
            <div>
              ${course.course_url ? `<a class="btn btn--ghost btn--sm" href="${esc(course.course_url)}" target="_blank" rel="noopener">ลิงก์คอร์สภายนอก</a>` : ''}
              <button class="btn btn--primary btn--sm" data-toggle-scourse="${esc(course.id)}" type="button">ดูบทเรียน</button>
            </div>
          </div>
          <div class="sub-card" style="margin-top:var(--space-3);" id="sprogress-${esc(course.id)}"><p class="dim small">กำลังโหลดความคืบหน้า...</p></div>
          <div class="hidden" id="scourse-${esc(course.id)}" style="margin-top:var(--space-4);"></div>
        </div>`).join('') || '<p class="empty-state">คุณยังไม่ได้รับสิทธิ์เข้าคอร์สใด — กรุณาติดต่ออาจารย์ผู้สอน</p>';

      all('[data-toggle-scourse]', container).forEach((button) => {
        button.addEventListener('click', async () => {
          const courseId = button.dataset.toggleScourse;
          const box = el(`scourse-${courseId}`);
          if (!box) return;
          try {
            if (box.classList.contains('hidden') && !box.dataset.loaded) {
              await renderStudentChapters(courseId, box);
              box.dataset.loaded = '1';
            }
            box.classList.toggle('hidden');
            button.textContent = box.classList.contains('hidden') ? 'ดูบทเรียน' : 'ซ่อนบทเรียน';
          } catch (error) {
            alert(error.message);
          }
        });
      });

      items.forEach(async (course) => {
        const progressBox = el(`sprogress-${course.id}`);
        if (!progressBox) return;
        try {
          progressBox.innerHTML = progressBlockHtml(await api(`/api/student/courses/${course.id}/progress`));
        } catch (error) {
          progressBox.innerHTML = `<p class="dim small">โหลดความคืบหน้าไม่สำเร็จ: ${esc(error.message)}</p>`;
        }
      });
    } catch (error) {
      container.innerHTML = `<p class="empty-state">โหลดคอร์สไม่สำเร็จ: ${esc(error.message)}</p>`;
    }
  }

  async function renderStudentChapters(courseId, box) {
    const [chapters, progress] = await Promise.all([
      api(`/api/student/courses/${courseId}/chapters`),
      api(`/api/student/courses/${courseId}/progress`).catch(() => null)
    ]);
    const items = Array.isArray(chapters) ? chapters : [];
    if (!items.length) {
      box.innerHTML = '<p class="empty-state">คอร์สนี้ยังไม่มีบทเรียน</p>';
      return;
    }

    box.innerHTML = `
      <div class="course-view">
        <aside class="course-sidebar">
          <div class="course-sidebar__progress-label">ความคืบหน้าคอร์ส</div>
          <div class="course-sidebar__progress-pct">${safePct(progress?.percent_complete)}%</div>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${safePct(progress?.percent_complete)}%;"></div></div>
          <nav class="chapter-nav">${items.map((chapter, index) => `
            <button class="chapter-nav-item" data-chapter-nav="${esc(chapter.id)}" data-title="${esc(chapter.title)}" type="button">
              <span class="chapter-nav-item__num">${String(index + 1).padStart(2, '0')}</span><span class="chapter-nav-item__title">${esc(chapter.title)}</span>
            </button>`).join('')}</nav>
        </aside>
        <div class="course-content" id="courseContent-${esc(courseId)}"><p class="empty-state">เลือกบทเรียนทางซ้ายเพื่อเริ่มเรียน</p></div>
      </div>`;

    const content = el(`courseContent-${courseId}`);
    const buttons = all('[data-chapter-nav]', box);
    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        buttons.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        content.innerHTML = '<p class="dim small">กำลังโหลด...</p>';
        try {
          await renderStudentChapterBody(button.dataset.chapterNav, content, button.dataset.title);
        } catch (error) {
          content.innerHTML = `<p class="dim small">โหลดบทเรียนไม่สำเร็จ: ${esc(error.message)}</p>`;
        }
      });
    });
    buttons[0]?.click();
  }

  function studentMaterialHtml(material) {
    if (material.type === 'image' && material.file_url) return `<div class="material-item"><strong>${esc(material.title)}</strong><img src="${esc(apiUrl(material.file_url))}" alt="${esc(material.title)}"></div>`;
    if (material.type === 'audio' && material.file_url) return `<div class="material-item"><strong>${esc(material.title)}</strong><audio controls src="${esc(apiUrl(material.file_url))}"></audio></div>`;
    return `<div class="material-item"><strong>${esc(material.title)}</strong>${material.body ? `<p>${esc(material.body)}</p>` : ''}</div>`;
  }

  async function renderStudentChapterBody(chapterId, body, title) {
    const [materials, quizzes] = await Promise.all([
      api(`/api/student/chapters/${chapterId}/materials`),
      api(`/api/student/chapters/${chapterId}/quizzes`)
    ]);
    const materialItems = Array.isArray(materials) ? materials : [];
    const quizItems = Array.isArray(quizzes) ? quizzes : [];

    body.innerHTML = `
      ${title ? `<h3 class="course-content__title">${esc(title)}</h3>` : ''}
      <div class="sub-card"><h4>เนื้อหา</h4>${materialItems.map(studentMaterialHtml).join('') || '<p class="empty-state">ยังไม่มีเนื้อหา</p>'}</div>
      <div class="sub-card">
        <h4>ควิซ</h4>
        ${quizItems.map((quiz) => `<div class="quiz-card"><div class="quiz-card__head"><strong>${esc(quiz.title)}</strong><button class="btn btn--primary btn--sm" data-take-quiz="${esc(quiz.id)}" type="button">ทำควิซ</button></div><div class="quiz-card__body hidden" id="squiz-${esc(quiz.id)}"></div></div>`).join('') || '<p class="empty-state">ยังไม่มีควิซในบทนี้</p>'}
      </div>`;

    all('[data-take-quiz]', body).forEach((button) => {
      button.addEventListener('click', async () => {
        const quizBody = el(`squiz-${button.dataset.takeQuiz}`);
        if (!quizBody) return;
        try {
          if (quizBody.classList.contains('hidden')) await renderQuizRunner(button.dataset.takeQuiz, quizBody);
          quizBody.classList.toggle('hidden');
        } catch (error) {
          alert(error.message);
        }
      });
    });
  }

  function normalizeSequence(items) {
    return (Array.isArray(items) ? items : []).map((item, index) => ({
      idx: typeof item === 'object' && item !== null && item.idx != null ? item.idx : index,
      text: typeof item === 'object' && item !== null ? (item.text ?? item.label ?? String(item.idx ?? '')) : String(item)
    }));
  }

  function questionTakeHtml(question) {
    const params = question.params || {};
    let input = '';
    if (question.quiz_type === 'multiple_choice') {
      input = (params.options || []).map((option, index) => `<label class="radio-field"><input type="radio" name="q${esc(question.id)}" value="${index}"> ${esc(option)}</label>`).join('');
    } else if (question.quiz_type === 'short_answer') {
      input = `<input type="text" name="q${esc(question.id)}" placeholder="พิมพ์คำตอบ">`;
    } else if (question.quiz_type === 'numeric') {
      input = `<input type="number" step="any" name="q${esc(question.id)}" placeholder="พิมพ์ตัวเลขคำตอบ">`;
    } else if (question.quiz_type === 'sequencing') {
      const shuffled = normalizeSequence(params.items).sort(() => Math.random() - 0.5);
      input = `<ol class="seq-list" data-seq="${esc(question.id)}">${shuffled.map((item) => `<li data-idx="${esc(item.idx)}"><span>${esc(item.text)}</span><span><button type="button" class="btn btn--ghost btn--sm" data-seq-up>▲</button> <button type="button" class="btn btn--ghost btn--sm" data-seq-down>▼</button></span></li>`).join('')}</ol>`;
    } else if (question.quiz_type === 'hotspot') {
      input = `<div class="hotspot-editor" data-hs-take="${esc(question.id)}"><img src="${esc(apiUrl(params.image_url))}" alt="รูปคำถาม"></div><p class="hint-sm" data-hs-take-status>คลิกบนรูปเพื่อตอบ</p>`;
    } else if (question.quiz_type === 'file_upload') {
      input = `<input type="file" name="q${esc(question.id)}" accept="${esc(params.accept || '*')}"> <span class="hint-sm">ขนาดไม่เกิน ${esc(params.max_mb || '?')} MB</span>`;
    }

    return `<div class="quiz-take" data-question="${esc(question.id)}" data-qtype="${esc(question.quiz_type)}">
      <div><strong>${esc(question.prompt)}</strong> <span class="dim small">(${esc(question.points)} คะแนน)</span></div>
      <div class="field" style="margin-top:8px;">${input}</div>
    </div>`;
  }

  function wireQuestionTake(question, runner) {
    const container = by(`[data-question="${CSS.escape(String(question.id))}"]`, runner);
    if (!container) return;

    if (question.quiz_type === 'sequencing') {
      const list = by('[data-seq]', container);
      list?.addEventListener('click', (event) => {
        const row = event.target.closest('li');
        if (!row) return;
        if (event.target.matches('[data-seq-up]') && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
        if (event.target.matches('[data-seq-down]') && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
      });
    }

    if (question.quiz_type === 'hotspot') {
      const editor = by('[data-hs-take]', container);
      const image = by('img', editor);
      const status = by('[data-hs-take-status]', container);
      image?.addEventListener('click', (event) => {
        const rect = image.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        editor.dataset.x = String(x);
        editor.dataset.y = String(y);
        all('.hotspot-marker', editor).forEach((marker) => marker.remove());
        const marker = document.createElement('div');
        marker.className = 'hotspot-marker';
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
        editor.appendChild(marker);
        if (status) status.textContent = `เลือกจุดแล้ว (${x.toFixed(1)}%, ${y.toFixed(1)}%)`;
      });
    }
  }

  function collectAnswer(question, runner) {
    const container = by(`[data-question="${CSS.escape(String(question.id))}"]`, runner);
    if (!container) return null;

    if (question.quiz_type === 'multiple_choice') {
      const checked = by(`input[name="q${CSS.escape(String(question.id))}"]:checked`, container);
      return checked ? { selected_index: parseInt(checked.value, 10) } : null;
    }
    if (question.quiz_type === 'short_answer') {
      const value = by(`input[name="q${CSS.escape(String(question.id))}"]`, container)?.value.trim();
      return value ? { text: value } : null;
    }
    if (question.quiz_type === 'numeric') {
      const value = by(`input[name="q${CSS.escape(String(question.id))}"]`, container)?.value;
      return value !== '' && value != null ? { value: parseFloat(value) } : null;
    }
    if (question.quiz_type === 'sequencing') {
      return { order: all('[data-seq] li', container).map((item) => parseInt(item.dataset.idx, 10)) };
    }
    if (question.quiz_type === 'hotspot') {
      const editor = by('[data-hs-take]', container);
      return editor?.dataset.x == null ? null : { x: parseFloat(editor.dataset.x), y: parseFloat(editor.dataset.y) };
    }
    return null;
  }

  async function renderQuizRunner(quizId, body) {
    const questions = await api(`/api/student/quizzes/${quizId}/questions`);
    const items = Array.isArray(questions) ? questions : [];
    body.innerHTML = `<div id="qrunner-${esc(quizId)}"></div><div id="qresult-${esc(quizId)}"></div>`;
    const runner = el(`qrunner-${quizId}`);
    const result = el(`qresult-${quizId}`);
    if (!runner) return;

    runner.innerHTML = `${items.map(questionTakeHtml).join('') || '<p class="empty-state">ควิซนี้ยังไม่มีคำถาม</p>'}<button class="btn btn--primary" data-submit-quiz="${esc(quizId)}" type="button">ส่งคำตอบทั้งหมด</button>`;
    items.forEach((question) => wireQuestionTake(question, runner));

    by('[data-submit-quiz]', runner)?.addEventListener('click', async function submitAll() {
      this.disabled = true;
      this.textContent = 'กำลังส่ง...';
      try {
        for (const question of items) {
          let answer = null;
          if (question.quiz_type === 'file_upload') {
            const file = by(`[data-question="${CSS.escape(String(question.id))}"] input[type="file"]`, runner)?.files?.[0];
            if (file) answer = { file_url: await uploadFile(file) };
          } else {
            answer = collectAnswer(question, runner);
          }
          if (answer != null) {
            await api(`/api/student/questions/${question.id}/submit`, { method: 'POST', body: JSON.stringify({ answer }) });
          }
        }
        if (result) await renderQuizResult(quizId, result);
      } catch (error) {
        alert(`เกิดข้อผิดพลาดในการส่งคำตอบ: ${error.message}`);
      } finally {
        this.disabled = false;
        this.textContent = 'ส่งคำตอบทั้งหมด';
      }
    });
  }

  async function renderQuizResult(quizId, box) {
    const result = await api(`/api/student/quizzes/${quizId}/result`);
    const rows = Array.isArray(result?.items) ? result.items : [];
    box.innerHTML = `<div class="sub-card">
      <h4>ผลคะแนน: ${esc(result?.total_score ?? 0)} / ${esc(result?.max_score ?? 0)}</h4>
      ${rows.map((item) => {
        const status = item.grading_state === 'pending'
          ? '<span class="result-icon--pending">รอตรวจ</span>'
          : item.is_correct
            ? '<span class="result-icon--correct">✓ ถูกต้อง</span>'
            : '<span class="result-icon--wrong">✗ ไม่ถูกต้อง</span>';
        return `<div class="result-row"><span>${esc(item.prompt)}</span><span>${status} ${item.score != null ? `(${esc(item.score)}/${esc(item.points)})` : `(เต็ม ${esc(item.points)})`}</span></div>`;
      }).join('')}
    </div>`;
  }

  function init() {
    bindLogin();
    bindAdmin();
    bindInstructorForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
