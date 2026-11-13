const API_BASE = '/api';

// 封装 fetch，处理未登录
async function apiFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        alert('登录已过期，请重新登录');
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
    }
    return res;
}

// 退出登录
async function logout() {
    if(confirm('确定要退出登录吗？')) {
        await apiFetch('/api/logout', { method: 'POST' });
        window.location.href = '/login.html';
    }
}

// --- 1. 处理发布纯文本通知 ---
document.getElementById('noticeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('noticeTitle').value;
    const content = document.getElementById('noticeContent').value;

    try {
        const res = await apiFetch(`${API_BASE}/publish-notice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        const data = await res.json();
        if (data.success) {
            alert('发布成功');
            e.target.reset();
            loadList();
        }
    } catch (err) { console.error(err); }
});

// --- 2. 处理文件上传 ---
document.getElementById('fileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('fileTitle').value;
    const category = document.getElementById('fileCategory').value;
    const originalFile = document.getElementById('originalFile').files[0];
    const pdfFile = document.getElementById('pdfFile').files[0];

    if (!originalFile && !pdfFile) {
        return alert('请至少上传一个文件');
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', category);
    if (originalFile) formData.append('original_file', originalFile);
    if (pdfFile) formData.append('pdf_file', pdfFile);

    try {
        const res = await apiFetch(`${API_BASE}/upload-file`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            alert('上传成功');
            e.target.reset();
            loadList();
        } else {
            alert(data.message);
        }
    } catch (err) { console.error(err); }
});

// --- 3. 加载并渲染列表 ---
async function loadList() {
    try {
        const res = await apiFetch(`${API_BASE}/all-data`);
        const list = await res.json();
        const container = document.getElementById('adminList');
        
        if (list.length === 0) {
            container.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">暂无数据</p>';
            return;
        }

        let html = '';
        list.forEach(item => {
            let tagClass = '';
            let tagName = '';
            
            if (item.type === 'text') {
                tagClass = 'tag-notice'; tagName = '文本通知';
            } else {
                if (item.category === 'halfmonthly') { tagClass = 'tag-half'; tagName = '半月刊'; }
                else if (item.category === 'meeting') { tagClass = 'tag-meeting'; tagName = '会议纪要'; }
                else { tagClass = 'tag-reg'; tagName = '规章文件'; }
            }

            html += `
                <div class="data-item">
                    <span class="tag ${tagClass}">${tagName}</span>
                    <span class="data-title">${item.title}</span>
                    <span class="data-date">${item.date}</span>
                    <button class="btn-red" onclick="deleteItem('${item.id}')">删除</button>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (err) { console.error('加载列表失败'); }
}

// 删除数据
async function deleteItem(id) {
    if (!confirm('确定删除吗？不可恢复。')) return;
    try {
        await apiFetch(`${API_BASE}/delete/${id}`, { method: 'DELETE' });
        loadList();
    } catch (err) { console.error(err); }
}

window.onload = loadList;