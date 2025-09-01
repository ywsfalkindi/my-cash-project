// server.js

require('dotenv').config(); // <-- لاستدعاء الأسرار من ملف .env
const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const session = require('express-session');
const rateLimit = require('express-rate-limit'); // <-- لاستيراد محدد الطلبات
const fs = require('fs').promises; // <-- لاستخدام نظام الملفات بشكل دائم

const app = express();
const port = 3000;

// --- منطقة الإعدادات الأمنية ---

// إعداد محدد الطلبات لمنع هجمات القوة الغاشمة (Brute-force)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // السماح بـ 100 طلب كحد أقصى لكل IP خلال 15 دقيقة
    message: 'لقد قمت بالعديد من الطلبات، يرجى المحاولة مرة أخرى بعد 15 دقيقة.',
});

// تطبيق محدد الطلبات على كل المسارات
app.use(limiter);

app.set('trust proxy', 1);

// استخدام مفتاح سري آمن من ملف .env
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    proxy: true,
    cookie: { 
        secure: true,
        sameSite: 'none'
    }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ===--- منطقة منطق الأكواد والتخزين الدائم ---===

const CODES_FILE_PATH = path.join(__dirname, 'codes.json');
let activeCodes = [];

// دالة لقراءة الأكواد من الملف عند بدء تشغيل الخادم
const loadCodesFromFile = async () => {
    try {
        await fs.access(CODES_FILE_PATH);
        const data = await fs.readFile(CODES_FILE_PATH, 'utf8');
        activeCodes = JSON.parse(data);
        console.log('تم تحميل الأكواد بنجاح.');
        
        // تنظيف الأكواد القديمة وغير المستخدمة
        const initialCount = activeCodes.length;
        activeCodes = activeCodes.filter(c => c.expires > Date.now() || c.used === false);
        if (activeCodes.length < initialCount) {
            await saveCodesToFile();
            console.log(`تم تنظيف ${initialCount - activeCodes.length} كود منتهي الصلاحية.`);
        }

    } catch (error) {
        // إذا لم يكن الملف موجوداً، يتم إنشاؤه
        if (error.code === 'ENOENT') {
            await saveCodesToFile();
            console.log('تم إنشاء ملف codes.json جديد.');
        } else {
            console.error('خطأ في قراءة ملف الأكواد:', error);
        }
    }
};

// دالة لحفظ الأكواد في الملف بعد كل تغيير
const saveCodesToFile = async () => {
    try {
        await fs.writeFile(CODES_FILE_PATH, JSON.stringify(activeCodes, null, 2));
    } catch (error) {
        console.error('خطأ في حفظ الأكواد:', error);
    }
};


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
        activeCodes.push({ code: newCode, used: false, expires: Date.now() + (5 * 60 * 1000) });
        
        await saveCodesToFile(); // <-- حفظ التغييرات بشكل دائم

        res.send(`
            <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>لقد حصلت على كود!</title><style>body { font-family: 'Cairo', sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; } .container { background: white; padding: 50px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); } h1 { color: #2c3e50; } .code { font-size: 3em; font-weight: bold; color: #27ae60; background: #ecf0f1; padding: 10px 20px; border-radius: 10px; letter-spacing: 5px; margin: 20px 0; } p { color: #7f8c8d; } a { color: #3498db; text-decoration: none; }</style></head><body><div class="container"><h1>🎉 تهانينا! 🎉</h1><p>لقد نجحت في تخطي الرابط. هذا هو الكود الخاص بك:</p><div class="code">${newCode}</div><p>انسخ هذا الكود، ثم <a href="/">ارجع إلى الصفحة الرئيسية</a> والصقه هناك لتربح نقطتك.</p></div></body></html>
        `);
    } else {
        res.redirect('/');
    }
});

app.post('/verify-code', async (req, res) => {
    const { code } = req.body;
    const foundCode = activeCodes.find(c => c.code === code && !c.used && c.expires > Date.now());
    
    if (foundCode) {
        foundCode.used = true;
        if (!req.session.points) {
            req.session.points = 0;
        }
        req.session.points++;
        
        await saveCodesToFile(); // <-- حفظ التغييرات بشكل دائم

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

    // --- إصلاح ثغرة Formula Injection ---
    let safeUsername = username;
    if (['=', '+', '-', '@'].includes(username.charAt(0))) {
        safeUsername = "'" + username;
    }
    // ------------------------------------

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
                    [safeUsername, points, new Date().toLocaleString()] // استخدام اسم المستخدم الآمن
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
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/giveaway', (req, res) => {
    res.sendFile(path.join(__dirname, 'giveaway.html'));
});

// تشغيل الخادم وقراءة الأكواد المخزنة
app.listen(port, () => {
    console.log(`المشروع يعمل الآن على الرابط http://localhost:${port}`);
    loadCodesFromFile();
});