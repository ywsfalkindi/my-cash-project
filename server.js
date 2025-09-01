// C:\Users\alkindi\Desktop\MyCashProject\server.js

require('dotenv').config();
const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const port = 3000;

// --- إعداد قاعدة البيانات ---
let db;
// دالة لإنشاء وتهيئة قاعدة البيانات
const setupDatabase = async () => {
    db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });
    // إنشاء جدول الأكواد إذا لم يكن موجودًا
    await db.exec(`
        CREATE TABLE IF NOT EXISTS codes (
            code TEXT PRIMARY KEY,
            used BOOLEAN NOT NULL DEFAULT 0,
            expires INTEGER NOT NULL
        )
    `);
    console.log('قاعدة البيانات جاهزة للعمل.');
};

// --- منطقة الإعدادات الأمنية ---

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'لقد قمت بالعديد من الطلبات، يرجى المحاولة مرة أخرى بعد 15 دقيقة.',
});

app.use(limiter);
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // تم التغيير إلى false لتحسين الأداء
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // يعمل فقط على HTTPS في بيئة الإنتاج
        sameSite: 'lax' // أكثر أمانًا
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// [تم الإصلاح] تم تصحيح مسار الملفات الثابتة ليخدم من المجلد الرئيسي
app.use(express.static(path.join(__dirname, 'public')));

// ===--- منطقة منطق الأكواد والتخزين الدائم (باستخدام قاعدة البيانات) ---===

app.get('/get-session-data', (req, res) => {
    if (!req.session.points) {
        req.session.points = 0;
    }
    res.json({ points: req.session.points });
});

app.get('/authorize', (req, res) => {
    req.session.can_see_code = true;
    res.redirect('/generate-code');
});

app.get('/generate-code', async (req, res) => {
    if (req.session.can_see_code === true) {
        req.session.can_see_code = false;

        const newCode = Math.floor(10000 + Math.random() * 90000).toString();
        const expires = Date.now() + (5 * 60 * 1000); // 5 دقائق صلاحية

        try {
            // إضافة الكود الجديد إلى قاعدة البيانات
            await db.run('INSERT INTO codes (code, used, expires) VALUES (?, 0, ?)', [newCode, expires]);
        } catch (error) {
            console.error('خطأ في إدراج الكود في قاعدة البيانات:', error);
            return res.status(500).send('حدث خطأ أثناء إنشاء الكود.');
        }

        res.send(`
            <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>لقد حصلت على كود!</title><style>body { font-family: 'Cairo', sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; } .container { background: white; padding: 50px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); } h1 { color: #2c3e50; } .code { font-size: 3em; font-weight: bold; color: #27ae60; background: #ecf0f1; padding: 10px 20px; border-radius: 10px; letter-spacing: 5px; margin: 20px 0; } p { color: #7f8c8d; } a { color: #3498db; text-decoration: none; }</style></head><body><div class="container"><h1>🎉 تهانينا! 🎉</h1><p>لقد نجحت في تخطي الرابط. هذا هو الكود الخاص بك:</p><div class="code">${newCode}</div><p>انسخ هذا الكود، ثم <a href="/">ارجع إلى الصفحة الرئيسية</a> والصقه هناك لتربح نقطتك.</p></div></body></html>
        `);
    } else {
        res.redirect('/');
    }
});

app.post('/verify-code', async (req, res) => {
    const { code } = req.body;
    const currentTime = Date.now();
    
    // البحث عن الكود في قاعدة البيانات
    const foundCode = await db.get('SELECT * FROM codes WHERE code = ? AND used = 0 AND expires > ?', [code, currentTime]);
    
    if (foundCode) {
        // تحديث حالة الكود إلى "مستخدم"
        await db.run('UPDATE codes SET used = 1 WHERE code = ?', [code]);

        if (!req.session.points) {
            req.session.points = 0;
        }
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
    
    // [تحسين] التحقق من صحة تنسيق اسم المستخدم
    if (!username || !/^[a-zA-Z0-9._]{1,30}$/.test(username.replace('@', ''))) {
        return res.json({ success: false, message: 'الرجاء إدخال اسم مستخدم انستغرام صحيح.' });
    }

    // [إصلاح] الحماية من ثغرة Formula Injection
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
                values: [
                    [safeUsername, points, new Date().toLocaleString()]
                ],
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/giveaway', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'giveaway.html'));
});

// دالة التنظيف التلقائي للأكواد القديمة
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
    }, 60 * 60 * 1000); // تعمل كل ساعة
};

// تشغيل الخادم وتهيئة قاعدة البيانات
app.listen(port, async () => {
    await setupDatabase();
    startCleanupInterval();
    console.log(`المشروع يعمل الآن على الرابط http://localhost:${port}`);
});