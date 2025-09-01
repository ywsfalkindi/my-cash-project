const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const session = require('express-session'); 

const app = express();
const port = 3000;

app.use(session({
    secret: 'a-very-strong-secret-key-that-no-one-knows', // <-- كلمة سر لتشفير الجلسات
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // في حالة النشر الحقيقي على استضافة HTTPS، يجب تغييرها إلى true
}));

// هذا السطر يسمح للخادم بفهم البيانات القادمة من النماذج
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// هذا السطر يجعل الخادم يقدم الملفات الثابتة مثل html, css, js
app.use(express.static(path.join(__dirname, 'public')));


// ===--- منطقة الأسرار والمنطق ---===

// مصفوفة لتخزين الأكواد التي تم إنشاؤها مؤقتًا
// في مشروع حقيقي، ستستخدم قاعدة بيانات لهذا الأمر
let activeCodes = [];

app.get('/get-session-data', (req, res) => {
    // إذا لم يكن للمستخدم نقاط بعد، نجعلها صفر
    if (!req.session.points) {
        req.session.points = 0;
    }
    res.json({ points: req.session.points });
});

app.get('/authorize', (req, res) => {
    // نعطي المستخدم "تذكرة" للدخول
    req.session.can_see_code = true;
    // نوجهه فورًا إلى صفحة الكود ليستخدم تذكرته
    res.redirect('/generate-code');
});

// المسار السري الذي يوجه إليه رابط الاختصار
app.get('/generate-code', (req, res) => {
    // الحارس يسأل أولاً: هل لديك تذكرة صالحة؟
    if (req.session.can_see_code === true) {
        // إذا كانت الإجابة نعم، نمزق التذكرة فورًا لمنع إعادة استخدامها
        req.session.can_see_code = false;

        // ثم نقوم بعملنا المعتاد: إنشاء الكود وإظهار الصفحة
        const newCode = Math.floor(10000 + Math.random() * 90000).toString();
        activeCodes.push({ code: newCode, used: false, expires: Date.now() + (5 * 60 * 1000) });
        
        res.send(`
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>لقد حصلت على كود!</title>
            <style>
                body { font-family: 'Cairo', sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
                .container { background: white; padding: 50px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                h1 { color: #2c3e50; }
                .code { font-size: 3em; font-weight: bold; color: #27ae60; background: #ecf0f1; padding: 10px 20px; border-radius: 10px; letter-spacing: 5px; margin: 20px 0; }
                p { color: #7f8c8d; }
                a { color: #3498db; text-decoration: none; }
            </style>
        </head>
            <body>
                <div class="container">
                    <h1>🎉 تهانينا! 🎉</h1>
                    <p>لقد نجحت في تخطي الرابط. هذا هو الكود الخاص بك:</p>
                    <div class="code">${newCode}</div>
                    <p>انسخ هذا الكود، ثم <a href="/">ارجع إلى الصفحة الرئيسية</a> والصقه هناك لتربح نقطتك.</p>
                </div>
            </body>
            </html>
        `);
    } else {
        // إذا لم يكن لديه تذكرة، نمنعه من الدخول ونعيده للصفحة الرئيسية
        res.redirect('/');
    }
});


// مسار للتحقق من الكود الذي أدخله المستخدم
app.post('/verify-code', (req, res) => {
    const { code } = req.body;
    const foundCode = activeCodes.find(c => c.code === code && !c.used && c.expires > Date.now());
    
    if (foundCode) {
        foundCode.used = true;
        // إذا لم يكن للمستخدم نقاط، نبدأ له من الصفر
        if (!req.session.points) {
            req.session.points = 0;
        }
        // نزيد نقاط المستخدم في "ملفه الخاص" على الخادم
        req.session.points++;
        // نرسل له رسالة النجاح مع عدد نقاطه الجديد
        res.json({ success: true, message: 'كود صحيح! لقد ربحت نقطة.', newPoints: req.session.points });
    } else {
        res.json({ success: false, message: 'الكود غير صحيح أو انتهت صلاحيته.' });
    }
});


// مسار لإرسال بيانات السحب إلى جوجل شيت
app.post('/submit-giveaway', async (req, res) => {
    // الآن نأخذ اليوزر فقط من المستخدم
    const { username } = req.body;
    // أما النقاط، فنأخذها من "ملف" المستخدم الآمن على الخادم
    const points = req.session.points || 0;

    // شرط أمان: لا نسمح بالمشاركة إذا لم يكن لدى المستخدم نقاط
    if (points <= 0) {
        return res.json({ success: false, message: 'ليس لديك نقاط كافية للمشاركة في السحب.' });
    }

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: 'credentials.json', // اسم الملف السري
            scopes: 'https://www.googleapis.com/auth/spreadsheets',
        });

        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });

        // هنا تضع ID الخاص بجدول البيانات
        // احصل عليه من رابط الجدول، يكون بين /d/ و /edit/
        const spreadsheetId = '1n5F2TQGQQ-LWckUV7EMnE9QD-VxeJel72CS2bCsB2Zw';

        // إضافة البيانات إلى الجدول
        await googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: 'Sheet1!A:C', // أو اسم الورقة التي تعمل عليها
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    [username, points, new Date().toLocaleString()]
                ],
            },
        });

        req.session.points = 0;

        res.json({ success: true, message: 'تم تسجيل مشاركتك في السحب بنجاح! بالتوفيق.' });
    } catch (error) {
        console.error('Error writing to Google Sheets', error);
        res.status(500).json({ success: false, message: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.' });
    }
});


// مسارات لتقديم الصفحات الأساسية
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/giveaway', (req, res) => {
    res.sendFile(path.join(__dirname, 'giveaway.html'));
});


// تشغيل الخادم
app.listen(port, () => {
    console.log(`المشروع يعمل الآن على الرابط http://localhost:${port}`);
});