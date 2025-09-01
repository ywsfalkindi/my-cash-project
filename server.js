// C:\Users\alkindi\Desktop\MyCashProject\server.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { google } = require('googleapis');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const port = 3000;

// --- تعريف الروابط المختصرة ---
const shortenedLinks = {
    '1': 'https://best-cash.net/AUTH',
    '2': 'https://short-jambo.ink/TnTZrBI',
    '3': 'https://best-cash.net/Ve4Jag'
};
const LINK_COOLDOWN = 24 * 60 * 60 * 1000; // 24 ساعة

// --- إعداد قاعدة البيانات ---
let db;
const setupDatabase = async () => {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS codes (
            code TEXT PRIMARY KEY,
            used BOOLEAN NOT NULL DEFAULT 0,
            expires INTEGER NOT NULL
        )
    `);
    console.log('قاعدة البيانات جاهزة للعمل.');
};

// --- الإعدادات العامة و Middleware ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'لقد قمت بالعديد من الطلبات، يرجى المحاولة مرة أخرى بعد 15 دقيقة.',
});
app.use(limiter);
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'a-very-secret-key-for-development',
    resave: false,
    saveUninitialized: true,
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

// تهيئة متغيرات الجلسة
app.use((req, res, next) => {
    if (req.session.points === undefined) {
        req.session.points = 0;
    }
    if (!req.session.linkCooldowns) {
        req.session.linkCooldowns = {};
    }
    next();
});

// **الخطوة الأهم**: تحديد مجلد "public" لخدمة الملفات (CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));


// ===--- تعريف المسارات الديناميكية (API Routes) ---===

app.get('/go/:linkId', (req, res) => {
    const { linkId } = req.params;
    const linkUrl = shortenedLinks[linkId];
    if (!linkUrl) {
        return res.status(404).send('الرابط غير موجود.');
    }
    const now = Date.now();
    const lastUsed = req.session.linkCooldowns[linkId];
    if (lastUsed && (now - lastUsed < LINK_COOLDOWN)) {
        return res.redirect('/?error=link_on_cooldown');
    }
    req.session.linkCooldowns[linkId] = now;
    req.session.can_see_code = true;
    res.redirect(linkUrl);
});

app.get('/get-link-status', (req, res) => {
    const statuses = {};
    const now = Date.now();
    for (const linkId in shortenedLinks) {
        const lastUsed = req.session.linkCooldowns[linkId];
        let disabled = false;
        let timeLeft = 0;
        if (lastUsed && (now - lastUsed < LINK_COOLDOWN)) {
            disabled = true;
            timeLeft = LINK_COOLDOWN - (now - lastUsed);
        }
        statuses[linkId] = { disabled, timeLeft };
    }
    res.json(statuses);
});

app.get('/get-session-data', (req, res) => {
    res.json({ points: req.session.points });
});

app.get('/generate-code', async (req, res) => {
    if (req.session.can_see_code === true) {
        req.session.can_see_code = false;
        const newCode = Math.floor(10000 + Math.random() * 90000).toString();
        const expires = Date.now() + (5 * 60 * 1000);
        try {
            await db.run('INSERT INTO codes (code, used, expires) VALUES (?, 0, ?)', [newCode, expires]);
            const codePageTemplate = await fs.readFile(path.join(__dirname, 'public', 'code.html'), 'utf8');
            const finalHtml = codePageTemplate.replace('{{CODE_PLACEHOLDER}}', newCode);
            res.send(finalHtml);
        } catch (error) {
            console.error('خطأ في مسار /generate-code:', error);
            return res.status(500).send('حدث خطأ أثناء إنشاء الكود.');
        }
    } else {
        res.redirect('/');
    }
});

app.post('/verify-code', async (req, res) => {
    const { code } = req.body;
    const currentTime = Date.now();
    const foundCode = await db.get('SELECT * FROM codes WHERE code = ? AND used = 0 AND expires > ?', [code, currentTime]);
    if (foundCode) {
        await db.run('UPDATE codes SET used = 1 WHERE code = ?', [code]);
        req.session.points++;
        res.json({ success: true, message: 'كود صحيح! لقد ربحت نقطة.', newPoints: req.session.points });
    } else {
        res.json({ success: false, message: 'الكود غير صحيح أو انتهت صلاحيته.' });
    }
});

app.post('/submit-giveaway', async (req, res) => {
    const { username } = req.body;
    const points = req.session.points || 0;
    if (points <= 0) {
        return res.json({ success: false, message: 'ليس لديك نقاط كافية للمشاركة في السحب.' });
    }
    if (!username || !/^[a-zA-Z0-9._]{1,30}$/.test(username.replace('@', ''))) {
        return res.json({ success: false, message: 'الرجاء إدخال اسم مستخدم انستغرام صحيح.' });
    }
    let safeUsername = username;
    if (['=', '+', '-', '@'].includes(username.charAt(0))) {
        safeUsername = "'" + username;
    }
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: 'credentials.json',
            scopes: 'https://www.googleapis.com/auth/spreadsheets',
        });
        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });
        const spreadsheetId = '1n5F2TQGQQ-LWckUV7EMnE9QD-VxeJel72CS2bCsB2Zw';
        await googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: 'Sheet1!A:C',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[safeUsername, points, new Date().toLocaleString()]],
            },
        });
        const pointsUsed = points;
        req.session.points = 0;
        res.json({ success: true, message: `تم تسجيل مشاركتك بـ ${pointsUsed} نقطة بنجاح! بالتوفيق.` });
    } catch (error) {
        console.error('Error writing to Google Sheets', error);
        res.status(500).json({ success: false, message: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.' });
    }
});


// ===--- معالجة الصفحات الرئيسية (HTML Routes) ---===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/giveaway', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'giveaway.html'));
});


// --- دالة التنظيف وتشغيل الخادم ---
const startCleanupInterval = () => {
    setInterval(async () => {
        const now = Date.now();
        try {
            const result = await db.run('DELETE FROM codes WHERE expires < ?', now);
            if (result.changes > 0) {
                console.log(`تم تنظيف ${result.changes} كود منتهي الصلاحية من قاعدة البيانات.`);
            }
        } catch (error) {
            console.error('خطأ أثناء تنظيف الأكواد القديمة:', error);
        }
    }, 60 * 60 * 1000);
};

app.listen(port, async () => {
    await setupDatabase();
    startCleanupInterval();
    console.log(`المشروع يعمل الآن على الرابط http://localhost:${port}`);
});