const token = () => localStorage.getItem('mh_token');

async function api(url, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    ...(token() ? { Authorization: 'Bearer ' + token() } : {})
  };
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Błąd');
  return d;
}

function msg(t) {
  const x = document.getElementById('message') || document.getElementById('adminMessage');
  if (x) x.textContent = t;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function avatar(user, size = '') {
  if (user?.avatar_url) return `<img class="avatar ${size}" src="${esc(user.avatar_url)}" alt="Profilówka ${esc(user.username)}">`;
  return `<div class="avatar avatar-placeholder ${size}">${esc((user?.username || '?').slice(0,1).toUpperCase())}</div>`;
}

async function loadCurrentUser() {
  const el = document.getElementById('authActions');
  if (!el) return;
  if (!token()) {
    el.innerHTML = '<a class="btn ghost" href="/login.html">Zaloguj</a><a class="btn" href="/register.html">Dołącz</a>';
    return;
  }
  try {
    const user = await api('/api/me');
    el.innerHTML = `<a class="user-chip" href="/profile.html"><span class="chip-avatar">${avatar(user)}</span><span>${esc(user.username)}</span></a>${user.role === 'admin' ? '<a class="btn ghost" href="/admin.html">Admin</a>' : ''}<button id="logout" class="btn ghost">Wyloguj</button>`;
    document.getElementById('logout').onclick = logout;
  } catch {
    localStorage.removeItem('mh_token');
    el.innerHTML = '<a class="btn ghost" href="/login.html">Zaloguj</a><a class="btn" href="/register.html">Dołącz</a>';
  }
}

function logout() {
  localStorage.removeItem('mh_token');
  location.href = '/';
}

async function loadPosts() {
  const el = document.getElementById('posts');
  if (!el) return;
  try {
    const posts = await api('/api/posts');
    el.innerHTML = posts.map((p, i) => `<article class="devpost">
      <div class="num">${String(i + 1).padStart(2, '0')}</div>
      <div><div class="eyebrow">${esc(p.category)} · ${new Date(p.created_at).toLocaleDateString('pl-PL')}</div>
      <h2>${esc(p.title)}</h2><p>${esc(p.content)}</p>
      <small>Autor: <a class="profile-link" href="/profile.html?u=${encodeURIComponent(p.author)}">${esc(p.author)}</a></small>
      <div class="like-row"><button class="like-btn ${p.liked ? 'liked' : ''}" data-like-post="${p.id}">♥ <span>${p.likes || 0}</span></button></div></div></article>`).join('');
    el.querySelectorAll('[data-like-post]').forEach(b => b.onclick = async () => {
      if (!token()) { location.href = '/login.html'; return; }
      try {
        const d = await api('/api/posts/' + b.dataset.likePost + '/like', { method: 'POST' });
        b.classList.toggle('liked', d.liked); b.querySelector('span').textContent = d.likes;
      } catch (e) { msg(e.message); }
    });
  } catch (e) { el.textContent = e.message; }
}

async function loadForum() {
  const el = document.getElementById('threads');
  if (!el) return;
  try {
    const ts = await api('/api/forum');
    el.innerHTML = ts.length ? ts.map(t => `<article class="thread">
      <div><h3><a href="/forum.html?thread=${t.id}">${esc(t.title)}</a></h3><p>${esc(t.content)}</p><small><a class="profile-link" href="/profile.html?u=${encodeURIComponent(t.author)}">${esc(t.author)}</a> · ${t.replies} odpowiedzi</small></div><b>${t.replies}</b>
    </article>`).join('') : '<div class="thread">Brak tematów — rozpocznij dyskusję.</div>';
  } catch (e) { el.textContent = e.message; }
}

async function loadThread() {
  const el = document.getElementById('threadView');
  if (!el) return;
  const id = new URLSearchParams(location.search).get('thread');
  if (!id) { el.innerHTML = '<div class="empty">Wybierz temat z listy forum.</div>'; return; }
  try {
    const data = await api('/api/forum/' + id);
    el.innerHTML = `<article class="thread-full"><div class="eyebrow">TEMAT FORUM</div><h2>${esc(data.thread.title)}</h2><p>${esc(data.thread.content)}</p><small>Autor: <a class="profile-link" href="/profile.html?u=${encodeURIComponent(data.thread.author)}">${esc(data.thread.author)}</a></small></article>
      <div class="replies"><h2>ODPOWIEDZI (${data.replies.length})</h2>${data.replies.map(r => `<article class="reply"><div class="reply-head">${avatar(r)}<div><a class="profile-link" href="/profile.html?u=${encodeURIComponent(r.author)}">${esc(r.author)}</a><small>${new Date(r.created_at).toLocaleString('pl-PL')}</small></div></div><p>${esc(r.content)}</p><button class="like-btn ${r.liked ? 'liked' : ''}" data-like-reply="${r.id}">♥ <span>${r.likes || 0}</span></button></article>`).join('')}</div>
      <div class="new-thread"><h2>ODPOWIEDZ</h2><form id="replyForm"><textarea name="content" placeholder="Napisz odpowiedź..." required></textarea><button class="btn">Odpowiedz</button></form></div>`;
    el.querySelectorAll('[data-like-reply]').forEach(b => b.onclick = async () => {
      if (!token()) { location.href = '/login.html'; return; }
      try { const d = await api('/api/forum/replies/' + b.dataset.likeReply + '/like', { method:'POST' }); b.classList.toggle('liked', d.liked); b.querySelector('span').textContent = d.likes; } catch(e) { msg(e.message); }
    });
    document.getElementById('replyForm').onsubmit = async e => {
      e.preventDefault();
      if (!token()) { location.href='/login.html'; return; }
      try { await api('/api/forum/' + id + '/replies', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(e.target))) }); await loadThread(); }
      catch(x) { msg(x.message); }
    };
  } catch (e) { el.textContent = e.message; }
}

async function loadProfile() {
  const el = document.getElementById('profile');
  if (!el) return;
  try {
    const username = new URLSearchParams(location.search).get('u');
    const data = await api('/api/profile/' + encodeURIComponent(username || (await api('/api/me')).username));
    const u = data.user;
    const own = token() && (await api('/api/me')).id === u.id;
    el.innerHTML = `<section class="profile-head"><div>${avatar(u, 'avatar-xl')}</div><div><div class="eyebrow">${u.role === 'admin' ? 'ADMINISTRATOR' : 'CZŁONEK SPOŁECZNOŚCI'}</div><h1>${esc(u.username)}</h1><p class="profile-bio">${esc(u.bio || 'Brak opisu profilu.')}</p><div class="profile-meta"><span>Dołączył: ${new Date(u.created_at).toLocaleDateString('pl-PL')}</span><span>${u.role === 'admin' ? 'Konto administratora' : 'Użytkownik'}</span></div></div></section>
      ${own ? `<section class="profile-edit"><h2>EDYTUJ PROFIL</h2><form id="profileForm"><div class="form-grid"><input name="username" value="${esc(u.username)}" minlength="3" placeholder="Nazwa użytkownika" required><input name="email" type="email" value="${esc(u.email)}" placeholder="E-mail" required></div><textarea name="bio" maxlength="500" placeholder="Krótki opis">${esc(u.bio)}</textarea><button class="btn">Zapisz profil</button></form><form id="avatarForm" class="avatar-form"><label>PROFILÓWKA <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp,image/gif" required></label><button class="btn ghost">Zmień zdjęcie</button></form><div id="profileMessage"></div></section>` : ''}
      <section class="profile-section"><div class="section-title"><div><div class="eyebrow">AKTYWNOŚĆ</div><h2>POSTY UŻYTKOWNIKA</h2></div><span class="count">${data.posts.length}</span></div>${renderProfilePosts(data.posts)}</section>
      <section class="profile-section"><div class="section-title"><div><div class="eyebrow">AKTYWNOŚĆ</div><h2>ODPOWIEDZI</h2></div><span class="count">${data.replies.length}</span></div>${data.replies.length ? data.replies.map(r => `<article class="profile-item"><small>W temacie: <a href="/forum.html?thread=${r.thread_id}">${esc(r.thread_title)}</a></small><p>${esc(r.content)}</p><button class="like-btn ${r.liked ? 'liked' : ''}" data-like-reply="${r.id}">♥ ${r.likes || 0}</button></article>`).join('') : '<div class="empty">Brak odpowiedzi.</div>'}</section>
      <section class="profile-section"><div class="section-title"><div><div class="eyebrow">SPOŁECZNOŚĆ</div><h2>POLUBIONE</h2></div><span class="count">${data.likedPosts.length + data.likedReplies.length}</span></div><h3 class="subheading">POLUBIONE POSTY</h3>${renderLikedPosts(data.likedPosts)}<h3 class="subheading">POLUBIONE ODPOWIEDZI</h3>${data.likedReplies.length ? data.likedReplies.map(r => `<article class="profile-item"><small>${esc(r.author)} · <a href="/forum.html?thread=${r.thread_id}">${esc(r.thread_title)}</a></small><p>${esc(r.content)}</p></article>`).join('') : '<div class="empty">Brak polubionych odpowiedzi.</div>'}</section>`;

    el.querySelectorAll('[data-like-reply]').forEach(b => b.onclick = async () => {
      if (!token()) { location.href='/login.html'; return; }
      const d = await api('/api/forum/replies/' + b.dataset.likeReply + '/like', {method:'POST'}); b.classList.toggle('liked', d.liked); b.textContent = `♥ ${d.likes}`;
    });
    el.querySelectorAll('[data-like-post]').forEach(b => b.onclick = async () => {
      if (!token()) { location.href='/login.html'; return; }
      const d = await api('/api/posts/' + b.dataset.likePost + '/like', {method:'POST'}); b.classList.toggle('liked', d.liked); b.textContent = `♥ ${d.likes}`;
    });
    const pf = document.getElementById('profileForm');
    if (pf) pf.onsubmit = async e => { e.preventDefault(); try { const d = await api('/api/me/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(pf)))}); localStorage.setItem('mh_token',d.token); msgProfile('Profil zapisany.'); setTimeout(()=>location.reload(),400); } catch(x) { msgProfile(x.message); } };
    const af = document.getElementById('avatarForm');
    if (af) af.onsubmit = async e => { e.preventDefault(); try { const d=await api('/api/profile/avatar',{method:'POST',body:new FormData(af)}); msgProfile('Profilówka została zmieniona.'); setTimeout(()=>location.reload(),400); } catch(x){msgProfile(x.message);} };
  } catch (e) { el.textContent = e.message; }
}

function msgProfile(t) { const el=document.getElementById('profileMessage'); if(el) el.textContent=t; }
function renderProfilePosts(posts) { return posts.length ? posts.map(p => `<article class="profile-item"><div class="eyebrow">${esc(p.category)} · ${new Date(p.created_at).toLocaleDateString('pl-PL')}</div><h3>${esc(p.title)}</h3><p>${esc(p.content)}</p><button class="like-btn ${p.liked ? 'liked' : ''}" data-like-post="${p.id}">♥ ${p.likes || 0}</button></article>`).join('') : '<div class="empty">Brak postów.</div>'; }
function renderLikedPosts(posts) { return posts.length ? posts.map(p => `<article class="profile-item"><small>${esc(p.author)} · ${esc(p.category)}</small><h3>${esc(p.title)}</h3><p>${esc(p.content)}</p></article>`).join('') : '<div class="empty">Brak polubionych postów.</div>'; }

async function loadStats() {
  const el = document.getElementById('stats'); if (!el) return;
  try { const s=await api('/api/admin/stats'); el.innerHTML=Object.entries(s).map(([k,v])=>`<div class="stat"><small>${k}</small><strong>${v}</strong></div>`).join(''); }
  catch(e) { el.textContent=e.message; }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  const lf=document.getElementById('loginForm');
  if(lf) lf.addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(lf)))});localStorage.setItem('mh_token',d.token);location.href=d.user.role==='admin'?'/admin.html':'/profile.html'}catch(x){msg(x.message)}});
  const rf=document.getElementById('registerForm');
  if(rf) rf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(rf)))});location.href='/login.html'}catch(x){msg(x.message)}});
  const tf=document.getElementById('threadForm');
  if(tf) tf.addEventListener('submit',async e=>{e.preventDefault();if(!token()){location.href='/login.html';return}try{await api('/api/forum',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(tf)))});tf.reset();loadForum()}catch(x){msg(x.message)}});
  const pf=document.getElementById('postForm');
  if(pf) pf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(pf)))});pf.reset();msg('Wpis został dodany.')}catch(x){msg(x.message)}});
  loadPosts(); loadForum(); loadThread(); loadProfile(); loadStats();
});
