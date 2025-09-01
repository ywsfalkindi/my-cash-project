document.addEventListener('DOMContentLoaded', () => {
    // التحقق إذا كنا في الصفحة الرئيسية
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn) {
        let points = 0;
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
                messageDiv.textContent = 'الرجاء إدخال الكود أولاً.';
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
                // نحدث عرض النقاط بناءً على الرقم القادم من الخادم
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
            const points = pointsInput.value.trim();

            if (!username || !points) {
                messageDiv.textContent = 'الرجاء ملء جميع الحقول.';
                messageDiv.className = 'error';
                return;
            }

            const response = await fetch('/submit-giveaway', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username }) // لا نرسل النقاط من هنا
            });

            const result = await response.json();

            if (result.success) {
                messageDiv.textContent = result.message;
                messageDiv.className = 'success';
                usernameInput.value = '';
                pointsInput.value = '';
                currentPointsDisplay.textContent = 0;
            } else {
                messageDiv.textContent = result.message;
                messageDiv.className = 'error';
            }
        });
    }
});