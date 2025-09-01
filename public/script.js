// script.js

document.addEventListener('DOMContentLoaded', () => {
    // التحقق إذا كنا في الصفحة الرئيسية
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        const pointsDisplay = document.getElementById('points');
        const codeInput = document.getElementById('codeInput');
        const messageDiv = document.getElementById('message');

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
            
            // --- [تم الإصلاح] ---
            // تم حذف المتغير points الذي كان يعتمد على حقل محذوف
            // تم تعديل الشرط ليعتمد على اسم المستخدم فقط
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
                // تم حذف السطر الذي كان يحاول تفريغ حقل النقاط المحذوف
                currentPointsDisplay.textContent = 0;
            } else {
                messageDiv.textContent = result.message;
                messageDiv.className = 'error';
            }
        });
    }
});