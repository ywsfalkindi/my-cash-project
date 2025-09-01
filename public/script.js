// script.js

// [جديد] دالة لتحويل مللي ثانية إلى تنسيق HH:MM:SS
function formatTime(ms) {
    if (ms <= 0) return "00:00:00";
    let seconds = Math.floor((ms / 1000) % 60);
    let minutes = Math.floor((ms / (1000 * 60)) % 60);
    let hours = Math.floor((ms / (1000 * 60 * 60)) % 24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return `${hours}:${minutes}:${seconds}`;
}

// [جديد] دالة لتحديث حالة الروابط بناءً على بيانات الخادم
async function updateLinkStatuses() {
    try {
        const response = await fetch('/get-link-status');
        const statuses = await response.json();

        document.querySelectorAll('.link-btn').forEach(link => {
            const linkId = link.dataset.linkId;
            const status = statuses[linkId];

            if (status && status.disabled) {
                link.classList.add('disabled');
                link.style.pointerEvents = 'none'; // منع النقر
                let timeLeft = status.timeLeft;

                // تحديث نص الزر فوراً
                link.textContent = `متاح بعد: ${formatTime(timeLeft)}`;

                // بدء عداد تنازلي
                const interval = setInterval(() => {
                    timeLeft -= 1000;
                    if (timeLeft > 0) {
                        link.textContent = `متاح بعد: ${formatTime(timeLeft)}`;
                    } else {
                        // إعادة الزر لوضعه الطبيعي عند انتهاء الوقت
                        clearInterval(interval);
                        link.textContent = `الرابط ${linkId === '1' ? 'الأول' : linkId === '2' ? 'الثاني' : 'الثالث'}`;
                        link.classList.remove('disabled');
                        link.style.pointerEvents = 'auto';
                    }
                }, 1000);
            }
        });
    } catch (error) {
        console.error('فشل في جلب حالة الروابط:', error);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // التحقق إذا كنا في الصفحة الرئيسية
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        const pointsDisplay = document.getElementById('points');
        const codeInput = document.getElementById('codeInput');
        const messageDiv = document.getElementById('message');

        // [تم التعديل] استدعاء دالة تحديث حالة الروابط عند تحميل الصفحة
        updateLinkStatuses();

        fetch('/get-session-data')
            .then(res => res.json())
            .then(data => {
                pointsDisplay.textContent = data.points || 0;
            });

        verifyBtn.addEventListener('click', async () => {
            const code = codeInput.value.trim();
            if (!code) {
                messageDiv.textContent = 'الرجاء إدخال الكود أولاً';
                messageDiv.className = 'error';
                return;
            }

            const response = await fetch('/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code })
            });

            const result = await response.json();

            if (result.success) {
                pointsDisplay.textContent = result.newPoints;
                messageDiv.textContent = result.message;
                messageDiv.className = 'success';
                codeInput.value = '';
            } else {
                messageDiv.textContent = result.message;
                messageDiv.className = 'error';
            }
        });
    }

    // التحقق إذا كنا في صفحة السحب
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        const usernameInput = document.getElementById('usernameInput');
        const messageDiv = document.getElementById('message');
        const currentPointsDisplay = document.getElementById('currentPoints');

        fetch('/get-session-data')
            .then(res => res.json())
            .then(data => {
                currentPointsDisplay.textContent = data.points || 0;
            });

        submitBtn.addEventListener('click', async () => {
            const username = usernameInput.value.trim();
            
            if (!username) {
                messageDiv.textContent = 'الرجاء إدخال يوزر انستغرام';
                messageDiv.className = 'error';
                return;
            }

            const response = await fetch('/submit-giveaway', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username })
            });

            const result = await response.json();

            if (result.success) {
                messageDiv.textContent = result.message;
                messageDiv.className = 'success';
                usernameInput.value = '';
                currentPointsDisplay.textContent = 0;
            } else {
                messageDiv.textContent = result.message;
                messageDiv.className = 'error';
            }
        });
    }
});