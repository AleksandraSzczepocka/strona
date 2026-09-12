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
    if (!t) return;

 
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }


    const toast = document.createElement('div');
    toast.className = 'toast-error';
    toast.textContent = t;

    container.appendChild(toast);


    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

//function avatar(user, size = '') {
//  if (user?.avatar_url) return `<img class="avatar ${size}" src="${esc(user.avatar_url)}" alt="Profilówka ${esc(user.username)}">`;
//  return `<div class="avatar avatar-placeholder ${size}">${esc((user?.username || '?').slice(0,1).toUpperCase())}</div>`;
//}

function avatar(user, size = '') {
    const imgUrl = user?.avatar_url || user?.avatar;
    const name = user?.username || user?.author || '?';

    if (imgUrl) {
        return `<img class="avatar ${size}" src="${esc(imgUrl)}" alt="Profilówka ${esc(name)}">`;
    }

    return `<div class="avatar avatar-placeholder ${size}">${esc(name.slice(0, 1).toUpperCase())}</div>`;
}

async function loadCurrentUser() {
  const el = document.getElementById('authActions');
  if (!el) return;
  if (!token()) {
    el.innerHTML = '<a class="btn ghost" href="/login">Zaloguj</a><a class="btn" href="/register">Dołącz</a>';
    return;
  }
  try {
    const user = await api('/api/me');
    el.innerHTML = `<a class="user-chip" href="/profile"><span class="chip-avatar">${avatar(user)}</span><span>${esc(user.username)}</span></a>${user.role === 'admin' ? '<a class="btn ghost" href="/admin">Admin</a>' : ''}<button id="logout" class="btn ghost">Wyloguj</button>`;
    document.getElementById('logout').onclick = logout;
  } catch {
    localStorage.removeItem('mh_token');
    el.innerHTML = '<a class="btn ghost" href="/login">Zaloguj</a><a class="btn" href="/register">Dołącz</a>';
  }
}

function logout() {
    localStorage.removeItem('mh_token');
    window.location.href = '/logout';
};



async function loadPosts() {
    const el = document.getElementById('posts');
    if (!el) return;
    try {
        const posts = await api('/api/posts');
        const currentUser = token() ? await api('/api/me').catch(() => null) : null;
        const isAdmin = currentUser?.role === 'admin';

        const html = posts.map((p) => {
            let mediaHtml = '';

            if (p.media_url) {
                const url = p.media_url.trim();
                const lowerUrl = url.toLowerCase();
                const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);

                if (ytMatch && ytMatch[1]) {
                    const videoId = ytMatch[1];
                    mediaHtml = `
                        <div class="post-media video-container">
                          <iframe src="https://www.youtube.com/embed/${videoId}" 
                                  frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                  allowfullscreen></iframe>
                        </div>`;
                }
                else if (lowerUrl.match(/\.(mp4|webm|ogg)$/)) {
                    mediaHtml = `
                        <div class="post-media">
                          <video controls>
                            <source src="${esc(url)}">
                            Twoja przeglądarka nie wspiera odtwarzacza wideo.
                          </video>
                        </div>`;
                }
                else if (lowerUrl.match(/\.(mp3|wav|ogg)$/)) {
                    mediaHtml = `
                        <div class="post-media">
                          <audio controls>
                            <source src="${esc(url)}">
                          </audio>
                        </div>`;
                }
                else if (lowerUrl.match(/\.(zip|rar|7z|tar|gz)$/)) {
                    mediaHtml = `
                        <div class="post-media file-attachment">
                          <a href="${esc(url)}" class="btn ghost" download>📦 Pobierz załącznik (${esc(url.split('/').pop())})</a>
                        </div>`;
                }
                else if (lowerUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)$/)) {
                    mediaHtml = `
                        <div class="post-media">
                          <img src="${esc(url)}" alt="Załącznik graficzny do wpisu: ${esc(p.title)}">
                        </div>`;
                }
                else {
                    mediaHtml = `
                        <div class="post-media">
                          <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">🔗 Zobacz załącznik / odnośnik</a>
                        </div>`;
                }
            }

            return `
        <article class="post-card" data-id="${p.id}">
          <div class="post-header">
            <span class="post-category">${esc(p.category)}</span>
            <span class="post-date">${new Date(p.created_at).toLocaleDateString('pl-PL')}</span>
          </div>
          <h2>${esc(p.title)}</h2>
          <div class="post-content">${esc(p.content)}</div>
          ${mediaHtml}
          <div class="post-footer">
            <span class="post-author">Autor: <strong>${esc(p.author || 'Admin')}</strong></span>
            ${isAdmin ? `
              <div class="admin-post-actions">
                <button class="btn ghost" data-edit-post="${p.id}">Edytuj</button>
                <button class="btn danger" data-delete-post="${p.id}">Usuń</button>
              </div>
            ` : ''}
          </div>
        </article>
      `;
        }).join('');

        el.innerHTML = html;

        if (isAdmin) {
 
            el.querySelectorAll('[data-delete-post]').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Czy na pewno chcesz usunąć ten post?')) return;
                    try {
                        await api(`/api/posts/${btn.dataset.deletePost}`, { method: 'DELETE' });
                        msg('Post został usunięty.');
                        loadPosts();
                    } catch (err) {
                        msg(err.message);
                    }
                };
            });


            el.querySelectorAll('[data-edit-post]').forEach(btn => {
                btn.onclick = () => {
                    const postCard = btn.closest('.post-card');
                    const postId = btn.dataset.editPost;

                    const title = postCard.querySelector('h2').textContent;
                    const content = postCard.querySelector('.post-content').textContent;
                    const category = postCard.querySelector('.post-category').textContent;
                    const hasMedia = !!postCard.querySelector('.post-media');

                    postCard.innerHTML = `
                        <form class="edit-post-form" data-id="${postId}">
                            <h3>Edycja posta</h3>
                            
                            <div class="form-group">
                                <label for="edit-title-${postId}">Tytuł</label>
                                <input type="text" id="edit-title-${postId}" name="title" value="${esc(title)}" required>
                            </div>

                            <div class="form-group">
                                <label for="edit-category-${postId}">Kategoria</label>
                                <input type="text" id="edit-category-${postId}" name="category" value="${esc(category)}" required>
                            </div>

                            <div class="form-group">
                                <label for="edit-content-${postId}">Treść</label>
                                <textarea id="edit-content-${postId}" name="content" required>${esc(content)}</textarea>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-media-${postId}">Zmień plik / multimedia</label>
                                <input type="file" id="edit-media-${postId}" name="media">
                            </div>

                            ${hasMedia ? `
                                <div class="form-group checkbox-group">
                                    <label class="checkbox-label">
                                        <input type="checkbox" name="remove_media" value="true"> 
                                        Usuń aktualny załącznik / multimedia
                                    </label>
                                </div>
                            ` : ''}

                            <div class="edit-form-actions">
                                <button type="submit" class="btn">Zapisz zmiany</button>
                                <button type="button" class="btn ghost btn-cancel">Anuluj</button>
                            </div>
                        </form>
                    `;

     
                    postCard.querySelector('.btn-cancel').onclick = () => loadPosts();

      
                    postCard.querySelector('form').onsubmit = async (e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target);

                        try {
                            await api(`/api/posts/${postId}`, {
                                method: 'PUT',
                                body: formData
                            });
                            msg('Post został pomyślnie zaktualizowany.');
                            loadPosts();
                        } catch (err) {
                            msg(err.message);
                        }
                    };
                };
            });
        }
    } catch (err) {
        el.innerHTML = '<p class="error">Nie udało się wczytać wpisów.</p>';
    }
}





async function loadForum() {
    const el = document.getElementById('threads');
    if (!el) return;
    try {
        const ts = await api('/api/forum');
        const currentUser = token() ? await api('/api/me').catch(() => null) : null;
        const isAdmin = currentUser?.role === 'admin';

        el.innerHTML = ts.length ? ts.map(t => `
      <article class="thread ${t.is_active === 0 ? 'disabled-post' : ''}">
        <div>
          <h3>
            <a href="/forum?thread=${t.id}">${esc(t.title)}</a> 
            ${t.is_active === 0 ? '<small class="badge-hidden">(Ukryty)</small>' : ''}
          </h3>
          <p>${esc(t.content)}</p>
          <small><a class="profile-link" href="/profile?u=${encodeURIComponent(t.author)}">${esc(t.author)}</a> · ${t.replies} odpowiedzi</small>
          
          ${isAdmin ? `
            <div class="admin-actions">
              <button class="btn ghost btn-admin" data-toggle-thread="${t.id}">
                ${t.is_active === 1 ? 'Ukryj' : 'Aktywuj'}
              </button>
              <button class="btn btn-admin-danger" data-delete-thread="${t.id}">
                Usuń
              </button>
            </div>
          ` : ''}
        </div>
        <b>${t.replies}</b>
      </article>`).join('') : '<div class="thread">Brak tematów — rozpocznij dyskusję.</div>';

        if (isAdmin) {
            
            el.querySelectorAll('[data-toggle-thread]').forEach(btn => {
                btn.onclick = async () => {
                    await api(`/api/admin/forum/threads/${btn.dataset.toggleThread}/toggle`, { method: 'PATCH' });
                    loadForum();
                };
            });
            
            el.querySelectorAll('[data-delete-thread]').forEach(btn => {
                btn.onclick = async () => {
                    if (!confirm('Usunąć ten wątek wraz z odpowiedziami?')) return;
                    await api(`/api/admin/forum/threads/${btn.dataset.deleteThread}`, { method: 'DELETE' });
                    loadForum();
                };
            });
        }

    } catch (e) { el.textContent = e.message; }
}

async function loadThread() {
    const el = document.getElementById('threadView');
    if (!el) return;
    const id = new URLSearchParams(location.search).get('thread');
    if (!id) { el.innerHTML = '<div class="empty">Wybierz temat z listy forum.</div>'; return; }

    try {
        const data = await api('/api/forum/' + id);
        const currentUser = token() ? await api('/api/me').catch(() => null) : null;
        const isAdmin = currentUser?.role === 'admin';
        const isThreadAuthor = currentUser && currentUser.id === data.thread.user_id;
        const isClosed = data.thread.status === 'closed';

        const updateReplies = data.replies.filter(r => r.is_update === 1);
        const standardReplies = data.replies.filter(r => r.is_update === 0);

        const threadCreatedAt = data.thread.created_at.endsWith('Z') ? data.thread.created_at : data.thread.created_at + 'Z';
        const threadMinutesPassed = (Date.now() - new Date(threadCreatedAt).getTime()) / (1000 * 60);
        const canEditThread = isAdmin || (isThreadAuthor && updateReplies.length === 0 && threadMinutesPassed <= 15);

        const lastUpdateId = updateReplies.length ? updateReplies[updateReplies.length - 1].id : null;

        const updatesHtml = updateReplies.map(u => {
            const isAuthor = currentUser && currentUser.id === u.user_id;
            const createdAt = u.created_at.endsWith('Z') ? u.created_at : u.created_at + 'Z';
            const minutesPassed = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60);

            const isLastUpdate = u.id === lastUpdateId;
            const canEditUpdate = isAdmin || (isAuthor && isLastUpdate && minutesPassed <= 15);

            return `
                <div class="thread-update-block" id="reply-${u.id}" style="margin-top:15px; padding:10px; border-left:3px solid #e74c3c; background:rgba(255,255,255,0.03);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <span class="update-label" style="font-weight:bold; color:#e74c3c;">UPDATE (${new Date(u.created_at).toLocaleString('pl-PL')})</span>
                        ${canEditUpdate ? `<button class="btn ghost btn-sm" data-edit-reply="${u.id}">Edytuj UPDATE</button>` : ''}
                    </div>
                    <div class="reply-content">${esc(u.content)}</div>
                </div>
            `;
        }).join('');

        let authorControls = '';
        if (isThreadAuthor || isAdmin) {
            authorControls = `
        <div class="author-tools">
          <div class="author-tools-header">
            <span>Status wątku: <strong class="status-tag ${isClosed ? 'closed' : 'open'}">${isClosed ? 'ZAMKNIĘTY' : 'OTWARTY'}</strong></span>
            <div class="author-tools-actions">
              ${canEditThread ? '<button class="btn ghost btn-sm" id="editThreadBtn">Edytuj wątek</button>' : ''}
              <button class="btn ghost btn-sm" id="toggleUpdateFormBtn">Dodaj UPDATE do posta</button>
              <button class="btn ghost btn-sm" id="toggleStatusBtn">
                ${isClosed ? 'Otwórz wątek' : 'Zamknij wątek'}
              </button>
            </div>
          </div>

          <form id="editThreadForm" class="update-form hidden">
            <div class="form-group">
              <label><strong>Tytuł wątku:</strong></label>
              <input type="text" name="title" value="${esc(data.thread.title)}" required style="width:100%; margin-bottom:10px;">
            </div>
            <div class="form-group">
              <label><strong>Treść wątku:</strong></label>
              <textarea name="content" required style="width:100%; height:120px;">${esc(data.thread.content)}</textarea>
            </div>
            <div class="update-form-buttons">
              <button type="submit" class="btn btn-sm">Zapisz zmiany</button>
              <button type="button" class="btn ghost btn-sm" id="cancelEditThreadBtn">Anuluj</button>
            </div>
          </form>

          <form id="updateForm" class="update-form hidden">
            <label><strong>Treść aktualizacji:</strong></label>
            <textarea name="content" placeholder="Wpisz treść aktualizacji..." required></textarea>
            <div class="update-form-buttons">
              <button type="submit" class="btn btn-sm">Doklej UPDATE</button>
              <button type="button" class="btn ghost btn-sm" id="cancelUpdateBtn">Anuluj</button>
            </div>
          </form>
        </div>
      `;
        }

        const repliesHtml = standardReplies.map(r => {
            const isReplyAuthor = currentUser && currentUser.id === r.user_id;
            const replyCreatedAt = r.created_at.endsWith('Z') ? r.created_at : r.created_at + 'Z';
            const minutesPassed = (Date.now() - new Date(replyCreatedAt).getTime()) / (1000 * 60);
            const canEdit = isAdmin || (isReplyAuthor && minutesPassed <= 15);

            return `
        <article class="reply" id="reply-${r.id}">
          <div class="reply-head">
            ${avatar({ avatar_url: r.avatar, username: r.author })}
            <div>
              <a class="profile-link" href="/profile?u=${encodeURIComponent(r.author)}">${esc(r.author)}</a>
              <small>${new Date(r.created_at).toLocaleString('pl-PL')}</small>
            </div>
          </div>
          <div class="reply-content">${esc(r.content)}</div>
          <div class="reply-actions">
            <button class="like-btn ${r.liked ? 'liked' : ''}" data-like-reply="${r.id}">♥ <span>${r.likes || 0}</span></button>
            ${canEdit ? `<button class="btn ghost btn-sm" data-edit-reply="${r.id}">Edytuj</button>` : ''}
          </div>
        </article>
      `;
        }).join('');

        el.innerHTML = `
      <article class="thread-full">
        <div class="eyebrow">TEMAT FORUM ${isClosed ? '• [ZAMKNIĘTY]' : ''}</div>
        <h2>${esc(data.thread.title)}</h2>
        <div class="thread-body">${esc(data.thread.content)}</div>
        
        <!-- Sekcja z doklejonymi UPDATE-ami -->
        <div class="thread-updates-container">
            ${updatesHtml}
        </div>

        <small>Autor: <a class="profile-link" href="/profile?u=${encodeURIComponent(data.thread.author)}">${esc(data.thread.author)}</a></small>
        ${authorControls}
      </article>

      <div class="replies">
        <h2>ODPOWIEDZI (${standardReplies.length})</h2>
        ${repliesHtml}
      </div>

      <div class="new-thread">
        ${isClosed ? '<div class="thread-closed-msg">Ten wątek został zamknięty. Nie można dodawać nowych odpowiedzi.</div>' : `
          <h2>ODPOWIEDZ</h2>
          <form id="replyForm">
            <textarea name="content" placeholder="Napisz odpowiedź..." required></textarea>
            <button class="btn">Odpowiedz</button>
          </form>
        `}
      </div>
    `;

        const editThreadBtn = document.getElementById('editThreadBtn');
        const editThreadForm = document.getElementById('editThreadForm');
        const cancelEditThreadBtn = document.getElementById('cancelEditThreadBtn');

        if (editThreadBtn) {
            editThreadBtn.onclick = () => editThreadForm.classList.toggle('hidden');
            cancelEditThreadBtn.onclick = () => editThreadForm.classList.add('hidden');

            editThreadForm.onsubmit = async (e) => {
                e.preventDefault();
                const title = editThreadForm.querySelector('input[name="title"]').value;
                const content = editThreadForm.querySelector('textarea[name="content"]').value;

                try {
                    await api(`/api/forum/threads/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, content })
                    });
                    msg('Wątek został zaktualizowany.');
                    loadThread();
                } catch (err) { msg(err.message); }
            };
        }

        const updateBtn = document.getElementById('toggleUpdateFormBtn');
        const updateForm = document.getElementById('updateForm');
        const cancelUpdateBtn = document.getElementById('cancelUpdateBtn');

        if (updateBtn) {
            updateBtn.onclick = () => updateForm.classList.toggle('hidden');
            cancelUpdateBtn.onclick = () => updateForm.classList.add('hidden');

            updateForm.onsubmit = async (e) => {
                e.preventDefault();
                const content = updateForm.querySelector('textarea').value;
                try {
                    await api(`/api/forum/threads/${id}/append-update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content })
                    });
                    msg('Doklejono aktualizację!');
                    loadThread();
                } catch (err) { msg(err.message); }
            };
        }

        const toggleStatusBtn = document.getElementById('toggleStatusBtn');
        if (toggleStatusBtn) {
            toggleStatusBtn.onclick = async () => {
                const newStatus = isClosed ? 'open' : 'closed';
                try {
                    await api(`/api/forum/threads/${id}/status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: newStatus })
                    });
                    msg(isClosed ? 'Otwarto wątek.' : 'Zamknięto wątek.');
                    loadThread();
                } catch (err) { msg(err.message); }
            };
        }

    
        el.querySelectorAll('[data-edit-reply]').forEach(b => b.onclick = () => {
            const replyId = b.dataset.editReply;
            const replyEl = document.getElementById(`reply-${replyId}`);
            const contentEl = replyEl.querySelector('.reply-content');
            const oldText = contentEl.textContent;

            replyEl.innerHTML = `
        <form class="edit-reply-form" style="margin-top:10px;">
          <textarea required style="width:100%; height:80px;">${esc(oldText)}</textarea>
          <div class="edit-form-actions" style="margin-top:5px;">
            <button type="submit" class="btn btn-sm">Zapisz</button>
            <button type="button" class="btn ghost btn-sm btn-cancel">Anuluj</button>
          </div>
        </form>
      `;

            replyEl.querySelector('.btn-cancel').onclick = () => loadThread();
            replyEl.querySelector('form').onsubmit = async (e) => {
                e.preventDefault();
                const newText = e.target.querySelector('textarea').value;
                try {
                    await api(`/api/forum/replies/${replyId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: newText })
                    });
                    msg('Zaktualizowano.');
                    loadThread();
                } catch (err) { msg(err.message); }
            };
        });

        el.querySelectorAll('[data-like-reply]').forEach(b => b.onclick = async () => {
            if (!token()) { location.href = '/login'; return; }
            try { const d = await api('/api/forum/replies/' + b.dataset.likeReply + '/like', { method: 'POST' }); b.classList.toggle('liked', d.liked); b.querySelector('span').textContent = d.likes; } catch (e) { msg(e.message); }
        });

        const rf = document.getElementById('replyForm');
        if (rf) {
            rf.onsubmit = async e => {
                e.preventDefault();
                if (!token()) { location.href = '/login'; return; }
                try {
                    await api('/api/forum/' + id + '/replies', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(Object.fromEntries(new FormData(rf)))
                    });
                    await loadThread();
                } catch (x) { msg(x.message); }
            };
        }

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
      <section class="profile-section"><div class="section-title"><div><div class="eyebrow">AKTYWNOŚĆ</div><h2>ODPOWIEDZI</h2></div><span class="count">${data.replies.length}</span></div>${data.replies.length ? data.replies.map(r => `<article class="profile-item"><small>W temacie: <a href="/forum?thread=${r.thread_id}">${esc(r.thread_title)}</a></small><p>${esc(r.content)}</p><button class="like-btn ${r.liked ? 'liked' : ''}" data-like-reply="${r.id}">♥ ${r.likes || 0}</button></article>`).join('') : '<div class="empty">Brak odpowiedzi.</div>'}</section>
      <section class="profile-section"><div class="section-title"><div><div class="eyebrow">SPOŁECZNOŚĆ</div><h2>POLUBIONE</h2></div><span class="count">${data.likedPosts.length + data.likedReplies.length}</span></div><h3 class="subheading">POLUBIONE POSTY</h3>${renderLikedPosts(data.likedPosts)}<h3 class="subheading">POLUBIONE ODPOWIEDZI</h3>${data.likedReplies.length ? data.likedReplies.map(r => `<article class="profile-item"><small>${esc(r.author)} · <a href="/forum?thread=${r.thread_id}">${esc(r.thread_title)}</a></small><p>${esc(r.content)}</p></article>`).join('') : '<div class="empty">Brak polubionych odpowiedzi.</div>'}</section>`;

    el.querySelectorAll('[data-like-reply]').forEach(b => b.onclick = async () => {
      if (!token()) { location.href='/login'; return; }
      const d = await api('/api/forum/replies/' + b.dataset.likeReply + '/like', {method:'POST'}); b.classList.toggle('liked', d.liked); b.textContent = `♥ ${d.likes}`;
    });
    el.querySelectorAll('[data-like-post]').forEach(b => b.onclick = async () => {
      if (!token()) { location.href='/login'; return; }
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




let galleryData = [];
let currentImageIndex = 0;

//async function loadGallery() {
//    const grid = document.getElementById('galleryGrid');
//    if (!grid) return;

//    try {
//        galleryData = await api('/api/gallery');
//        const currentUser = token() ? await api('/api/me').catch(() => null) : null;
//        const isAdmin = currentUser?.role === 'admin';

//        if (!galleryData.length) {
//            grid.innerHTML = '<div class="empty">Brak zdjęć w galerii.</div>';
//            return;
//        }

//        grid.innerHTML = galleryData.map((img, idx) => `
//            <div class="gallery-card" data-index="${idx}">
//                <img src="${esc(img.image_url)}" alt="${esc(img.title)}" loading="lazy">
//                <div class="card-info">
//                    <span>${esc(img.title || 'Bez tytułu')}</span>
//                    ${isAdmin ? `<button class="btn-delete-img" data-delete-id="${img.id}">Usuń</button>` : ''}
//                </div>
//            </div>
//        `).join('');


//        grid.querySelectorAll('.gallery-card').forEach(card => {
//            card.addEventListener('click', (e) => {
//                if (e.target.classList.contains('btn-delete-img')) return;
//                openLightbox(parseInt(card.dataset.index, 10));
//            });
//        });


//        grid.querySelectorAll('[data-delete-id]').forEach(btn => {
//            btn.onclick = async (e) => {
//                e.stopPropagation();
//                if (!confirm('Czy na pewno chcesz usunąć to zdjęcie?')) return;
//                try {
//                    await api('/api/gallery/' + btn.dataset.deleteId, { method: 'DELETE' });
//                    loadGallery();
//                } catch (err) {
//                    alert(err.message);
//                }
//            };
//        });

//    } catch (err) {
//        grid.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
//    }
//}

async function loadGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    try {
        galleryData = await api('/api/gallery');
        const currentUser = token() ? await api('/api/me').catch(() => null) : null;
        const isAdmin = currentUser?.role === 'admin';

        if (!galleryData.length) {
            grid.innerHTML = '<div class="empty">Brak zdjęć w galerii.</div>';
            return;
        }

        grid.innerHTML = galleryData.map((img, idx) => `
            <div class="gallery-card" data-index="${idx}" data-id="${img.id}">
                <img src="${esc(img.image_url)}" alt="${esc(img.alt_text || img.title || 'Zdjęcie w galerii')}" loading="lazy">
                <div class="card-info">
                    <span class="img-title">${esc(img.title || 'Bez tytułu')}</span>
                    ${isAdmin ? `
                        <div class="admin-gallery-actions">
                            <button class="btn-edit-img btn ghost btn-sm" data-edit-id="${img.id}">Edytuj</button>
                            <button class="btn-delete-img btn danger btn-sm" data-delete-id="${img.id}">Usuń</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.gallery-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.admin-gallery-actions') || e.target.tagName === 'INPUT' || e.target.tagName === 'FORM') return;
                openLightbox(parseInt(card.dataset.index, 10));
            });
        });

        if (isAdmin) {
            grid.querySelectorAll('[data-edit-id]').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const card = btn.closest('.gallery-card');
                    const imgId = btn.dataset.editId;
                    const item = galleryData.find(g => g.id == imgId);

                    card.querySelector('.card-info').innerHTML = `
                        <form class="edit-gallery-form" style="width:100%; display:flex; flex-direction:column; gap:5px; margin-top:5px;">
                            <input type="text" name="title" value="${esc(item.title)}" placeholder="Tytuł" required style="font-size:12px; padding:4px;">
                            <input type="text" name="alt_text" value="${esc(item.alt_text || '')}" placeholder="Opis alternatywny (alt)" required style="font-size:12px; padding:4px;">
                            <div style="display:flex; gap:5px; margin-top:5px;">
                                <button type="submit" class="btn btn-sm" style="padding:2px 6px;">Zapisz</button>
                                <button type="button" class="btn ghost btn-sm btn-cancel-edit" style="padding:2px 6px;">Anuluj</button>
                            </div>
                        </form>
                    `;

                    card.querySelector('.btn-cancel-edit').onclick = (ev) => {
                        ev.stopPropagation();
                        loadGallery();
                    };

                    card.querySelector('form').onsubmit = async (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        const title = ev.target.title.value;
                        const alt_text = ev.target.alt_text.value;

                        try {
                            await api(`/api/gallery/${imgId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ title, alt_text })
                            });
                            msg('Zaktualizowano dane zdjęcia.');
                            loadGallery();
                        } catch (err) {
                            msg(err.message);
                        }
                    };
                };
            });

            grid.querySelectorAll('[data-delete-id]').forEach(btn => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm('Czy na pewno chcesz usunąć to zdjęcie?')) return;
                    try {
                        await api('/api/gallery/' + btn.dataset.deleteId, { method: 'DELETE' });
                        msg('Zdjęcie usunięte.');
                        loadGallery();
                    } catch (err) {
                        msg(err.message);
                    }
                };
            });
        }

    } catch (err) {
        grid.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
}


function openLightbox(index) {
    if (index < 0 || index >= galleryData.length) return;
    currentImageIndex = index;
    const item = galleryData[currentImageIndex];

    const lb = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightboxImg');
    const lbCaption = document.getElementById('lightboxCaption');

    lbImg.src = item.image_url;
    lbImg.alt = item.alt_text || item.title || 'Powiększone zdjęcie z galerii';
    lbCaption.textContent = item.title ? `${item.title} (Autor: ${item.author})` : `Autor: ${item.author}`;
    lb.style.display = 'flex';
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.style.display = 'none';
}

function setupGalleryEvents() {
    
    const form = document.getElementById('galleryUploadForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const msgEl = document.getElementById('galleryAdminMsg');
            try {
                const formData = new FormData(form);
                await api('/api/gallery', {
                    method: 'POST',
                    body: formData
                });
                form.reset();
                if (msgEl) msgEl.textContent = 'Zdjęcie pomyślnie dodane!';
                loadGallery();
            } catch (err) {
                if (msgEl) msgEl.textContent = err.message;
            }
        };
    }

    
    const lb = document.getElementById('lightbox');
    if (!lb) return;

    lb.querySelector('.lightbox-close').onclick = closeLightbox;
    lb.querySelector('.lightbox-prev').onclick = () => openLightbox(currentImageIndex - 1);
    lb.querySelector('.lightbox-next').onclick = () => openLightbox(currentImageIndex + 1);

   
    lb.onclick = (e) => {
        if (e.target === lb) closeLightbox();
    };

    
    document.addEventListener('keydown', (e) => {
        if (lb.style.display !== 'flex') return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') openLightbox(currentImageIndex - 1);
        if (e.key === 'ArrowRight') openLightbox(currentImageIndex + 1);
    });
};



// Zarządzanie użytkownikami dla admina
async function loadAdminUsers() {
    const tbody = document.getElementById('usersList');
    if (!tbody) return;

    try {
        const users = await api('/api/admin/users');
        tbody.innerHTML = users.map(u => `
      <tr style="border-bottom: 1px solid #222;">
        <td style="padding: 10px;">${u.id}</td>
        <td>
          <a class="profile-link" href="/profile?u=${encodeURIComponent(u.username)}">${esc(u.username)}</a>
          <span class="user-email">(${esc(u.email)})</span>
        </td>
        <td style="padding: 10px;"><span class="badge">${esc(u.role)}</span></td>
        <td style="padding: 10px;">
          ${u.role !== 'admin' ? `
            <button class="btn ghost" style="padding: 4px 8px; font-size: 12px;" data-role-user="${u.id}" data-role="admin">Daj Admina</button>
          ` : `
            <button class="btn ghost" style="padding: 4px 8px; font-size: 12px;" data-role-user="${u.id}" data-role="user">Odbierz Admina</button>
          `}
          <button class="btn" style="padding: 4px 8px; font-size: 12px; background: #c0392b;" data-delete-user="${u.id}">Usuń</button>
        </td>
      </tr>
    `).join('');

        // Obsługa zmiany roli
        tbody.querySelectorAll('[data-role-user]').forEach(btn => {
            btn.onclick = async () => {
                const userId = btn.dataset.roleUser;
                const newRole = btn.dataset.role;
                if (!confirm(`Czy na pewno chcesz zmienić rolę użytkownika na ${newRole}?`)) return;

                try {
                    await api(`/api/admin/users/${userId}/role`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: newRole })
                    });
                    msg('Rola została pomyślnie zmieniona.');
                    loadAdminUsers();
                } catch (e) {
                    msg(e.message);
                }
            };
        });

        // Obsługa usuwania użytkownika
        tbody.querySelectorAll('[data-delete-user]').forEach(btn => {
            btn.onclick = async () => {
                const userId = btn.dataset.deleteUser;
                if (!confirm('Czy na pewno chcesz usunąć tego użytkownika? Operacja jest nieodwracalna.')) return;

                try {
                    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
                    msg('Użytkownik został usunięty.');
                    loadAdminUsers();
                } catch (e) {
                    msg(e.message);
                }
            };
        });

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="padding: 10px; color: red;">${esc(e.message)}</td></tr>`;
    }
};




// Inicjalizacja przy ładowaniu strony
document.addEventListener('DOMContentLoaded', () => {
    loadGallery();
    setupGalleryEvents();
});



// Funkcja obsługująca kliknięcie w oko
function setupPasswordToggles() {
    document.querySelectorAll('.btn-toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrapper = btn.closest('.password-wrapper');
            const input = wrapper ? wrapper.querySelector('input') : null;
            if (!input) return;

            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            const icon = btn.querySelector('[data-lucide]');
            if (icon) {
                icon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
                lucide.createIcons();
            }
        });
    });
}




document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        const logoutBtn = e.target.closest('#logout');
        if (logoutBtn) {
            e.preventDefault();
            logout();
        }
   });
  loadCurrentUser();
  const lf=document.getElementById('loginForm');
  if(lf) lf.addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(lf)))});localStorage.setItem('mh_token',d.token);location.href=d.user.role==='admin'?'/admin':'/profile'}catch(x){msg(x.message)}});
  const rf=document.getElementById('registerForm');
  if(rf) rf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(rf)))});location.href='/login'}catch(x){msg(x.message)}});
  const tf=document.getElementById('threadForm');
  if(tf) tf.addEventListener('submit',async e=>{e.preventDefault();if(!token()){location.href='/login';return}try{await api('/api/forum',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(tf)))});tf.reset();loadForum()}catch(x){msg(x.message)}});
  //const pf=document.getElementById('postForm');
    //if(pf) pf.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(pf)))});pf.reset();msg('Wpis został dodany.')}catch(x){msg(x.message)}});


    const pf = document.getElementById('postForm');
    if (pf) {
        pf.addEventListener('submit', async e => {
            e.preventDefault();
            try {
                const formData = new FormData(pf);

              
                await api('/api/posts', {
                    method: 'POST',
                    body: formData
                });

                pf.reset();
                msg('Wpis został dodany.');
                loadPosts();
            } catch (x) {
                msg(x.message);
            }
        });
    }
    loadPosts(); loadForum(); loadThread(); loadProfile(); loadStats(); loadAdminUsers(); if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    } setupPasswordToggles();
});
