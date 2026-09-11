

const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { registerSchema, postSchema, profileSchema, forumThreadSchema, validate } = require('./src/validators');


const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mimcry-hunters-prototype-secret';

const databaseDir = path.join(__dirname, 'database');
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(databaseDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

// Inicjalizacja bazy danych i ustawienie trybu WAL
const db = new Database(path.join(databaseDir, 'mimcry.db'));

db.pragma('journal_mode = WAL');
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
  user_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Devlog',
  media_url TEXT,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  user_id INTEGER,
  content TEXT NOT NULL,
  is_update INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
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
CREATE TABLE IF NOT EXISTS gallery_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Migracja statusu w forum
const threadColumns = db.prepare('PRAGMA table_info(forum_threads)').all().map(c => c.name);
if (!threadColumns.includes('is_active')) db.exec("ALTER TABLE forum_threads ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");

const replyColumns = db.prepare('PRAGMA table_info(forum_replies)').all().map(c => c.name);
if (!replyColumns.includes('is_active')) db.exec("ALTER TABLE forum_replies ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");


// Migracja bazy
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userColumns.includes('bio')) db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
if (!userColumns.includes('avatar_url')) db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''");

// Statyczne, przygotowane zapytania (zapobiegają wyciekom pamięci w V8)
const stmtGetUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtGetUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtGetUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');

const adminExists = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
if (!adminExists) {
    const hash = bcrypt.hashSync('Admin123!', 10);
    db.prepare('INSERT INTO users (username,email,password_hash,role) VALUES (?,?,?,?)')
        .run('admin', 'admin@mimcryhunters.local', hash, 'admin');
}

const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;
if (!postCount) {
    const adminUser = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('admin');
    const seed = db.prepare('INSERT INTO posts (user_id,title,content,category) VALUES (?,?,?,?)');
    seed.run(adminUser.id, 'Witamy w wymiarze Mimcry', 'Rozpoczynamy dziennik produkcji.', 'Devlog');
    seed.run(adminUser.id, 'Projektowanie demona', 'Pierwsze testy sylwetki przeciwnika.', 'Design');
    seed.run(adminUser.id, 'Zagadki i eksploracja', 'Budujemy system zagadek.', 'Gameplay');
}

// Konfiguracja widoków Twig



app.set('view engine', 'twig');
app.set('views', path.join(__dirname, 'views'));
app.set('twig options', { cache: false, allow_async: true });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


// Zamyka nieaktywne połączenia, zapobiegając zawieszaniu sterty C++
app.use((req, res, next) => {
    //res.setHeader('Connection', 'close');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    //res.setHeader('Content-Type', 'text/html; charset=utf-8');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    req.user = null;
    res.locals.user = null;

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            res.locals.user = decoded;
        } catch {
            res.clearCookie('token');
        }
    }
    next();
});

function auth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Wymagane logowanie' });
    next();
}

function optionalAuth(req, _res, next) {
    next();
}

function admin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Wymagane uprawnienia administratora' });
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

app.get('/', (req, res) => res.render('index.twig', { activePage: 'index' }));
app.get('/gallery', (req, res) => {
    res.render('gallery.twig', { activePage: 'gallery' });
});

app.get('/devlog', (req, res) => res.render('devlog.twig', { activePage: 'devlog' }));
app.get('/forum', (req, res) => res.render('forum.twig', { activePage: 'forum' }));
app.get('/login', (req, res) => res.render('login.twig', { activePage: 'login' }));
app.get('/register', (req, res) => res.render('register.twig', { activePage: 'register' }));

app.get('/admin', (req, res) => {
    if (!req.user || req.user.role !== 'admin') return res.redirect('/login');
    res.render('admin.twig', { activePage: 'admin' });
});

app.get('/profile', (req, res) => {
    if (!req.user) return res.redirect('/login');
    res.render('profile.twig', { activePage: 'profile' });
});


app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});



app.post('/api/auth/register', validate(registerSchema), (req, res) => {
    const { username, email, password } = req.body;

    try {
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users(username,email,password_hash) VALUES(?,?,?)').run(username, email, hash);
        res.status(201).json({ id: result.lastInsertRowid, message: 'Konto utworzone' });
    } catch {
        res.status(409).json({ error: 'Nazwa użytkownika lub e-mail jest już zajęty' });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '').trim();

        const user = stmtGetUserByEmail.get(email);

        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 2 * 3600 * 1000 });
        return res.json({ token, user: publicUser(user) });
    } catch (err) {
        console.error('Błąd logowania:', err);
        return res.status(500).json({ error: 'Błąd serwera podczas logowania' });
    }
});




app.get('/api/me', auth, (req, res) => {
    const user = stmtGetUserById.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
    res.json(publicUser(user));
});

app.get('/api/profile/:username', optionalAuth, (req, res) => {
    const user = stmtGetUserByUsername.get(req.params.username);
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

app.put('/api/me/profile', auth, validate(profileSchema), (req, res) => {
    const { username, email, bio } = req.body;
    try {
        db.prepare('UPDATE users SET username=?, email=?, bio=? WHERE id=?').run(username, email, bio, req.user.id);
        const updated = stmtGetUserById.get(req.user.id);
        const token = jwt.sign({ id: updated.id, username: updated.username, role: updated.role }, JWT_SECRET, { expiresIn: '2h' });
        res.cookie('token', token, { httpOnly: true, maxAge: 2 * 3600 * 1000 });
        res.json({ user: publicUser(updated), token });
    } catch {
        res.status(409).json({ error: 'Nazwa użytkownika lub e-mail jest już zajęty' });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `file-${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } 
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
    try {
        const userId = req.user ? req.user.id : 0;

        const posts = db.prepare(`
            SELECT 
                p.id,
                p.title,
                p.content,
                p.category,
                p.media_url,
                (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS likes,
                p.created_at,
                COALESCE(u.username, 'Nieznany użytkownik') AS author,
                EXISTS(SELECT 1 FROM post_likes me WHERE me.post_id = p.id AND me.user_id = ?) AS liked
            FROM posts p
            LEFT JOIN users u ON u.id = p.user_id 
            WHERE p.published = 1
            ORDER BY p.created_at DESC
        `).all(userId);

        res.json(posts);
    } catch (err) {
        console.error('Błąd pobierania postów:', err);
        res.status(500).json({ error: 'Błąd podczas pobierania postów.' });
    }
});

app.post('/api/posts', auth, admin, upload.single('media_file'), (req, res) => {
  const { title, content, category, media_url } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'Tytuł i treść są wymagane.' });
  }

  let finalMediaUrl = media_url || null;
  if (req.file) {
    finalMediaUrl = `/uploads/${req.file.filename}`;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO posts (user_id, title, content, category, media_url) 
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(req.user.id, title.trim(), content.trim(), category || 'Devlog', finalMediaUrl);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Wpis został pomyślnie dodany.' });
  } catch (err) {
    console.error('Błąd podczas dodawania posta:', err);
    res.status(500).json({ error: 'Błąd podczas tworzenia wpisu.' });
  }
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
    try {
        const result = db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Post nie został znaleziony.' });
        }

        res.json({ message: 'Post został pomyślnie usunięty.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd podczas usuwania posta.' });
    }
});

app.put('/api/posts/:id', auth, admin, upload.single('media'), (req, res) => {
    try {
        const { title, content, category, remove_media } = req.body;
        const postId = req.params.id;

        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
        if (!post) {
            return res.status(404).json({ error: 'Post nie został znaleziony.' });
        }

        let mediaUrl = post.media_url;

        if (req.file) {
            mediaUrl = `/uploads/${req.file.filename}`;
        }
        else if (remove_media === 'true') {
            mediaUrl = null;
        }

        db.prepare(`
            UPDATE posts 
            SET title = ?, content = ?, category = ?, media_url = ?
            WHERE id = ?
        `).run(title, content, category, mediaUrl, postId);

        res.json({ message: 'Post został pomyślnie zaktualizowany.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd podczas edycji posta.' });
    }
});






app.get('/api/forum', optionalAuth, (req, res) => {
    const isAdmin = req.user && req.user.role === 'admin';
    const whereClause = isAdmin ? '' : 'WHERE t.is_active = 1';

    const threads = db.prepare(`
    SELECT t.id, t.title, t.content, t.is_active, t.created_at, 
      COALESCE(u.username, 'Nieznany użytkownik') AS author,
      (SELECT COUNT(*) FROM forum_replies r WHERE r.thread_id=t.id ${isAdmin ? '' : 'AND r.is_active = 1'}) replies
    FROM forum_threads t LEFT JOIN users u ON u.id=t.user_id 
    ${whereClause}
    ORDER BY t.created_at DESC`).all();
    res.json(threads);
});

app.get('/api/forum/:id', optionalAuth, (req, res) => {
    const thread = db.prepare(`
    SELECT t.id, t.title, t.content, t.created_at, t.user_id, t.status,
      COALESCE(u.username, 'Nieznany użytkownik') AS author
    FROM forum_threads t LEFT JOIN users u ON u.id=t.user_id WHERE t.id=?`).get(req.params.id);

    if (!thread) return res.status(404).json({ error: 'Nie znaleziono tematu' });

    const replies = db.prepare(`
    SELECT r.id, r.content, r.created_at, r.user_id, r.is_update,
    COALESCE(u.username, 'Nieznany użytkownik') AS author, u.avatar_url AS avatar,
    (SELECT COUNT(*) FROM reply_likes rl WHERE rl.reply_id=r.id) likes,
    ${req.user ? 'EXISTS(SELECT 1 FROM reply_likes me WHERE me.reply_id=r.id AND me.user_id=@viewer) AS liked' : '0 AS liked'}
    FROM forum_replies r LEFT JOIN users u ON u.id=r.user_id 
    WHERE r.thread_id=@threadId ORDER BY r.created_at ASC`).all(req.user ? { viewer: req.user.id, threadId: req.params.id } : { threadId: req.params.id });

    res.json({ thread, replies });
});


app.patch('/api/admin/forum/threads/:id/toggle', auth, admin, (req, res) => {
    db.prepare('UPDATE forum_threads SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

app.put('/api/forum/threads/:id', auth, (req, res) => {
    try {
        const threadId = req.params.id;
        const title = String(req.body.title || '').trim();
        const content = String(req.body.content || '').trim();

        if (!title || !content) {
            return res.status(400).json({ error: 'Tytuł i treść nie mogą być puste.' });
        }

        const thread = db.prepare('SELECT * FROM forum_threads WHERE id = ?').get(threadId);
        if (!thread) return res.status(404).json({ error: 'Wątek nie istnieje.' });

        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            if (thread.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Nie jesteś autorem tego wątku.' });
            }

            //const createdTime = new Date(thread.created_at).getTime();
            const createdTime = new Date(thread.created_at.endsWith('Z') ? thread.created_at : thread.created_at + 'Z').getTime();
            const minutesPassed = (Date.now() - createdTime) / (1000 * 60);

            if (minutesPassed > 15) {
                return res.status(403).json({ error: 'Upłynął czas na edycję wątku (max 15 minut).' });
            }
        }

        db.prepare('UPDATE forum_threads SET title = ?, content = ? WHERE id = ?').run(title, content, threadId);
        res.json({ message: 'Wątek został zaktualizowany.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd serwera podczas edycji wątku.' });
    }
});


app.delete('/api/admin/forum/threads/:id', auth, admin, (req, res) => {
    db.prepare('DELETE FROM forum_threads WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

app.patch('/api/admin/forum/replies/:id/toggle', auth, admin, (req, res) => {
    db.prepare('UPDATE forum_replies SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

app.delete('/api/admin/forum/replies/:id', auth, admin, (req, res) => {
    db.prepare('DELETE FROM forum_replies WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

app.put('/api/forum/replies/:id', auth, (req, res) => {
    try {
        const replyId = req.params.id;
        const content = String(req.body.content || '').trim();
        if (!content) return res.status(400).json({ error: 'Treść odpowiedzi nie może być pusta.' });

        const reply = db.prepare('SELECT * FROM forum_replies WHERE id = ?').get(replyId);
        if (!reply) return res.status(404).json({ error: 'Odpowiedź nie istnieje.' });

        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            if (reply.user_id !== req.user.id) {
                return res.status(403).json({ error: 'Nie możesz edytować tej odpowiedzi.' });
            }
            //const createdTime = new Date(reply.created_at).getTime();
            const createdTime = new Date(reply.created_at.toISOString ? reply.created_at.toISOString() : reply.created_at + 'Z').getTime();
            const minutesPassed = (Date.now() - createdTime) / (1000 * 60);
            if (minutesPassed > 15) {
                return res.status(403).json({ error: 'Upłynął czas na edycję (max 15 min).' });
            }
        }

        db.prepare('UPDATE forum_replies SET content = ? WHERE id = ?').run(content, replyId);
        res.json({ message: 'Zaktualizowano odpowiedź.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd serwera.' });
    }
});


app.post('/api/forum/threads/:id/status', auth, (req, res) => {
    try {
        const threadId = req.params.id;
        const { status } = req.body;

        const thread = db.prepare('SELECT * FROM forum_threads WHERE id = ?').get(threadId);
        if (!thread) return res.status(404).json({ error: 'Wątek nie istnieje.' });

        const isAdmin = req.user.role === 'admin';
        if (thread.user_id !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: 'Tylko autor lub admin może zmienić status.' });
        }

        db.prepare('UPDATE forum_threads SET status = ? WHERE id = ?').run(status, threadId);
        res.json({ message: 'Zaktualizowano status wątku.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd serwera.' });
    }
});

app.post('/api/forum/threads/:id/append-update', auth, (req, res) => {
    try {
        const threadId = req.params.id;
        const updateText = String(req.body.content || '').trim();
        if (!updateText) return res.status(400).json({ error: 'Treść aktualizacji nie może być pusta.' });

        const thread = db.prepare('SELECT * FROM forum_threads WHERE id = ?').get(threadId);
        if (!thread) return res.status(404).json({ error: 'Wątek nie istnieje.' });

        const isAdmin = req.user.role === 'admin';
        if (thread.user_id !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: 'Brak uprawnień do edycji wątku.' });
        }

        const formattedDate = new Date().toLocaleString('pl-PL');
        const appendedContent = `${thread.content}\n\n--- UPDATE (${formattedDate}) ---\n${updateText}`;

        db.prepare('UPDATE forum_threads SET content = ? WHERE id = ?').run(appendedContent, threadId);

        res.json({ message: 'Zaktualizowano treść wątku.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd serwera.' });
    }
});

app.post('/api/forum', auth, validate(forumThreadSchema), (req, res) => {
    const { title, content } = req.body;
    const r = db.prepare('INSERT INTO forum_threads(user_id,title,content) VALUES(?,?,?)').run(req.user.id, title, content);
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


//app.get('/api/gallery', (req, res) => {
//    try {
//        const images = db.prepare(`
//            SELECT g.*, u.username AS author
//            FROM gallery_images g
//            JOIN users u ON u.id = g.user_id
//            ORDER BY g.created_at DESC
//        `).all();
//        res.json(images);
//    } catch (err) {
//        res.status(500).json({ error: 'Błąd podczas pobierania zdjęć galerii' });
//    }
//});

app.get('/api/gallery', (req, res) => {
    try {
        const images = db.prepare(`
            SELECT g.*, COALESCE(u.username, 'Nieznany użytkownik') AS author 
            FROM gallery_images g 
            LEFT JOIN users u ON u.id = g.user_id 
            ORDER BY g.created_at DESC
        `).all();
        res.json(images);
    } catch (err) {
        res.status(500).json({ error: 'Błąd podczas pobierania zdjęć galerii' });
    }
});

// Wgrywanie nowego zdjęcia do galerii (tylko ADMIN)
app.post('/api/gallery', auth, admin, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nie przesłano pliku obrazu' });

    const title = String(req.body.title || '').trim();
    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const finalName = `gallery-${Date.now()}${ext}`;
    const finalPath = path.join(uploadDir, finalName);

    try {
        fs.renameSync(req.file.path, finalPath);
        const imageUrl = `/uploads/${finalName}`;

        const result = db.prepare(`
            INSERT INTO gallery_images (user_id, title, image_url) 
            VALUES (?, ?, ?)
        `).run(req.user.id, title, imageUrl);

        res.status(201).json({ id: result.lastInsertRowid, image_url: imageUrl, title });
    } catch (err) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Błąd podczas zapisywania zdjęcia' });
    }
});

// Usuwanie zdjęcia z galerii (tylko ADMIN)
app.delete('/api/gallery/:id', auth, admin, (req, res) => {
    try {
        const image = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(req.params.id);
        if (!image) return res.status(404).json({ error: 'Zdjęcie nie istnieje' });

        const filePath = path.join(__dirname, 'public', image.image_url.replace(/^\//, ''));
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        db.prepare('DELETE FROM gallery_images WHERE id = ?').run(req.params.id);
        res.json({ message: 'Zdjęcie zostało usunięte z galerii' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd podczas usuwania zdjęcia' });
    }
});

// zarządzanie użytkownikami

app.get('/api/admin/users', auth, admin, (req, res) => {
    try {
        const users = db.prepare('SELECT id, username, email, role FROM users ORDER BY id DESC').all();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Błąd pobierania bazy danych' });
    }
});

app.patch('/api/admin/users/:id/role', auth, admin, (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Nieprawidłowa rola' });
    }

    try {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Nie udało się zmienić roli' });
    }
});

app.delete('/api/admin/users/:id', auth, admin, (req, res) => {
    const { id } = req.params;

    if (req.user && req.user.id === parseInt(id)) {
        return res.status(400).json({ error: 'Nie możesz usunąć własnego konta administratora!' });
    }

    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Nie udało się usunąć użytkownika' });
    }
});

// Wypadkowy widok dla pozostałych ścieżek
app.get('/{*splat}', (req, res) => {
    res.render('index.twig', { activePage: 'index' });
});

// Zabezpieczenie przed nieobsłużonymi błędami i prawidłowe czyszczenie bazy
process.on('uncaughtException', (err) => {
    console.error('Nieobsłużony błąd:', err);
});

const server = app.listen(PORT, () => {
    console.log(`Mimcry Hunters: http://localhost:${PORT}`);
});

function shutdown() {
    console.log('Zamykanie aplikacji...');

    server.close(() => {
        try {
            if (db.open) {
                db.close();
            }
        } catch (err) {
            console.error('Błąd zamykania bazy:', err);
        }

        process.exit(0);
    });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);