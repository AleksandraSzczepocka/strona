const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mimcry-hunters-prototype-secret';

const databaseDir = path.join(__dirname, 'database');
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(databaseDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(databaseDir, 'mimcry.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Devlog',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS post_likes (
  user_id INTEGER NOT NULL,
  post_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, post_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reply_likes (
  user_id INTEGER NOT NULL,
  reply_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, reply_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reply_id) REFERENCES forum_replies(id) ON DELETE CASCADE
);
`);

// Migracja istniejącej bazy utworzonej przez starszą wersję prototypu.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColumns.includes('bio')) db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
if (!userColumns.includes('avatar_url')) db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''");

const adminExists = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('Admin123!', 10);
  db.prepare('INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,?)')
    .run('admin', 'admin@mimcryhunters.local', hash, 'admin');
}

const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
if (!postCount) {
  // Parametr ? jest celowo użyty zamiast role="admin" – SQLite traktuje "admin" jako nazwę kolumny.
  const admin = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
  const seed = db.prepare('INSERT INTO posts (user_id,title,content,category) VALUES (?,?,?,?)');
  seed.run(admin.id, 'Witamy w wymiarze Mimcry', 'Rozpoczynamy dziennik produkcji. Naukowcy są uwięzieni w miejscu, którego nie powinno być.', 'Devlog');
  seed.run(admin.id, 'Projektowanie demona', 'Pierwsze testy sylwetki i zachowania przeciwnika. Demon jest rezultatem badań zespołu.', 'Design');
  seed.run(admin.id, 'Zagadki i eksploracja', 'Budujemy system zagadek oparty na dokumentach, terminalach i obserwacji otoczenia.', 'Gameplay');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Wymagane logowanie' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
  }
}
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* publiczny request */ }
  }
  next();
}
function admin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Wymagane uprawnienia administratora' });
  next();
}
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    bio: user.bio || '',
    avatar_url: user.avatar_url || '',
    created_at: user.created_at
  };
}

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !email || !password || password.length < 8)
    return res.status(400).json({ error: 'Podaj nazwę, poprawny e-mail i hasło min. 8 znaków' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users(username,email,password_hash) VALUES(?,?,?)').run(username, email, hash);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Konto utworzone' });
  } catch (e) {
    res.status(409).json({ error: 'Nazwa użytkownika lub e-mail jest już zajęty' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
  res.json(publicUser(user));
});

app.get('/api/profile/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika' });

  const posts = db.prepare(`
    SELECT p.id,p.title,p.content,p.category,p.published,p.created_at,
           (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id=p.id) likes,
           ${req.user ? 'EXISTS(SELECT 1 FROM post_likes me WHERE me.post_id=p.id AND me.user_id=@viewer) AS liked' : '0 AS liked'}
    FROM posts p
    WHERE p.user_id = @userId AND p.published = 1
    ORDER BY p.created_at DESC
  `).all(req.user ? { viewer: req.user.id, userId: user.id } : { userId: user.id });

  const replies = db.prepare(`
    SELECT r.id,r.thread_id,r.content,r.created_at,t.title AS thread_title,
           (SELECT COUNT(*) FROM reply_likes rl WHERE rl.reply_id=r.id) likes,
           ${req.user ? 'EXISTS(SELECT 1 FROM reply_likes me WHERE me.reply_id=r.id AND me.user_id=@viewer) AS liked' : '0 AS liked'}
    FROM forum_replies r
    JOIN forum_threads t ON t.id=r.thread_id
    WHERE r.user_id = @userId
    ORDER BY r.created_at DESC
  `).all(req.user ? { viewer: req.user.id, userId: user.id } : { userId: user.id });

  const likedPosts = db.prepare(`
    SELECT p.id,p.title,p.content,p.category,p.created_at,u.username author
    FROM post_likes pl JOIN posts p ON p.id=pl.post_id JOIN users u ON u.id=p.user_id
    WHERE pl.user_id=? AND p.published=1 ORDER BY pl.created_at DESC
  `).all(user.id);

  const likedReplies = db.prepare(`
    SELECT r.id,r.thread_id,r.content,r.created_at,t.title thread_title,u.username author
    FROM reply_likes rl JOIN forum_replies r ON r.id=rl.reply_id
    JOIN forum_threads t ON t.id=r.thread_id JOIN users u ON u.id=r.user_id
    WHERE rl.user_id=? ORDER BY rl.created_at DESC
  `).all(user.id);

  res.json({ user: publicUser(user), posts, replies, likedPosts, likedReplies });
});

app.put('/api/me/profile', auth, (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
  const username = String(req.body.username ?? current.username).trim();
  const email = String(req.body.email ?? current.email).trim().toLowerCase();
  const bio = String(req.body.bio ?? '').trim().slice(0, 500);
  if (username.length < 3) return res.status(400).json({ error: 'Nazwa użytkownika musi mieć min. 3 znaki' });
  if (!email) return res.status(400).json({ error: 'E-mail jest wymagany' });
  try {
    db.prepare('UPDATE users SET username=?, email=?, bio=? WHERE id=?').run(username, email, bio, req.user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    // Token zawiera username, więc po zmianie nazwy generujemy nowy.
    const token = jwt.sign({ id: updated.id, username: updated.username, role: updated.role }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ user: publicUser(updated), token });
  } catch {
    res.status(409).json({ error: 'Nazwa użytkownika lub e-mail jest już zajęty' });
  }
});

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpeg|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Dozwolone są tylko obrazy PNG, JPG, WEBP lub GIF'));
  }
});
app.post('/api/profile/avatar', auth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nie wybrano obrazka' });
  const old = db.prepare('SELECT avatar_url FROM users WHERE id=?').get(req.user.id);
  if (old?.avatar_url) {
    const oldPath = path.join(__dirname, 'public', old.avatar_url.replace(/^\//, ''));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  const ext = path.extname(req.file.originalname).toLowerCase() || '.img';
  const finalName = `${req.user.id}-${Date.now()}${ext}`;
  const finalPath = path.join(uploadDir, finalName);
  fs.renameSync(req.file.path, finalPath);
  const avatarUrl = `/uploads/${finalName}`;
  db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(avatarUrl, req.user.id);
  res.json({ avatar_url: avatarUrl });
});

app.get('/api/posts', optionalAuth, (req, res) => {
  const posts = db.prepare(`
    SELECT p.id,p.title,p.content,p.category,p.published,p.created_at,u.username author,
      (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id=p.id) likes,
      ${req.user ? 'EXISTS(SELECT 1 FROM post_likes me WHERE me.post_id=p.id AND me.user_id=@viewer) AS liked' : '0 AS liked'}
    FROM posts p JOIN users u ON u.id=p.user_id
    WHERE p.published=1 ORDER BY p.created_at DESC
  `).all(req.user ? { viewer: req.user.id } : {});
  res.json(posts);
});
app.post('/api/posts', auth, (req, res) => {
  const { title, content, category = 'Devlog' } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Tytuł i treść są wymagane' });
  const r = db.prepare('INSERT INTO posts(user_id,title,content,category) VALUES(?,?,?,?)').run(req.user.id, String(title).trim(), String(content).trim(), String(category).trim());
  res.status(201).json({ id: r.lastInsertRowid });
});
app.post('/api/posts/:id/like', auth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id=? AND published=1').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Nie znaleziono wpisu' });
  const existing = db.prepare('SELECT 1 FROM post_likes WHERE user_id=? AND post_id=?').get(req.user.id, req.params.id);
  if (existing) db.prepare('DELETE FROM post_likes WHERE user_id=? AND post_id=?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO post_likes(user_id,post_id) VALUES(?,?)').run(req.user.id, req.params.id);
  const likes = db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id=?').get(req.params.id).c;
  res.json({ liked: !existing, likes });
});
app.delete('/api/posts/:id', auth, admin, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  res.json({ message: 'Usunięto' });
});

app.get('/api/forum', (req, res) => {
  const threads = db.prepare(`SELECT t.id,t.title,t.content,t.created_at,u.username author,
    (SELECT COUNT(*) FROM forum_replies r WHERE r.thread_id=t.id) replies
    FROM forum_threads t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC`).all();
  res.json(threads);
});
app.get('/api/forum/:id', optionalAuth, (req, res) => {
  const thread = db.prepare(`SELECT t.id,t.title,t.content,t.created_at,t.user_id,u.username author
    FROM forum_threads t JOIN users u ON u.id=t.user_id WHERE t.id=?`).get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Nie znaleziono tematu' });
  const replies = db.prepare(`SELECT r.id,r.content,r.created_at,r.user_id,u.username author,
    (SELECT COUNT(*) FROM reply_likes rl WHERE rl.reply_id=r.id) likes,
    ${req.user ? 'EXISTS(SELECT 1 FROM reply_likes me WHERE me.reply_id=r.id AND me.user_id=@viewer) AS liked' : '0 AS liked'}
    FROM forum_replies r JOIN users u ON u.id=r.user_id WHERE r.thread_id=@threadId ORDER BY r.created_at ASC`).all(req.user ? { viewer: req.user.id, threadId: req.params.id } : { threadId: req.params.id });
  res.json({ thread, replies });
});
app.post('/api/forum', auth, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Tytuł i treść są wymagane' });
  const r = db.prepare('INSERT INTO forum_threads(user_id,title,content) VALUES(?,?,?)').run(req.user.id, String(title).trim(), String(content).trim());
  res.status(201).json({ id: r.lastInsertRowid });
});
app.post('/api/forum/:id/replies', auth, (req, res) => {
  const thread = db.prepare('SELECT id FROM forum_threads WHERE id=?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Nie znaleziono tematu' });
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Treść odpowiedzi jest wymagana' });
  const r = db.prepare('INSERT INTO forum_replies(thread_id,user_id,content) VALUES(?,?,?)').run(req.params.id, req.user.id, content);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.post('/api/forum/replies/:id/like', auth, (req, res) => {
  const reply = db.prepare('SELECT id FROM forum_replies WHERE id=?').get(req.params.id);
  if (!reply) return res.status(404).json({ error: 'Nie znaleziono odpowiedzi' });
  const existing = db.prepare('SELECT 1 FROM reply_likes WHERE user_id=? AND reply_id=?').get(req.user.id, req.params.id);
  if (existing) db.prepare('DELETE FROM reply_likes WHERE user_id=? AND reply_id=?').run(req.user.id, req.params.id);
  else db.prepare('INSERT INTO reply_likes(user_id,reply_id) VALUES(?,?)').run(req.user.id, req.params.id);
  const likes = db.prepare('SELECT COUNT(*) c FROM reply_likes WHERE reply_id=?').get(req.params.id).c;
  res.json({ liked: !existing, likes });
});

app.post('/api/media', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nie wybrano pliku' });
  const r = db.prepare('INSERT INTO media(user_id,filename,original_name,media_type) VALUES(?,?,?,?)')
    .run(req.user.id, req.file.filename, req.file.originalname, req.file.mimetype);
  res.status(201).json({ id: r.lastInsertRowid, filename: req.file.filename });
});
app.get('/api/media', (req, res) => {
  res.json(db.prepare('SELECT m.*,u.username author FROM media m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC').all());
});

app.get('/api/admin/stats', auth, admin, (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const posts = db.prepare('SELECT COUNT(*) c FROM posts').get().c;
  const threads = db.prepare('SELECT COUNT(*) c FROM forum_threads').get().c;
  const media = db.prepare('SELECT COUNT(*) c FROM media').get().c;
  res.json({ users, posts, threads, media });
});

// Express 5 / path-to-regexp: '*' jest niepoprawne. Ta składnia obsługuje także '/'.
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Mimcry Hunters: http://localhost:${PORT}`));
