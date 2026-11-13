const API_BASE = '/api';
let globalData = {}; // 全局存放首页的数据

// 获取文件并渲染到列表
async function loadFiles(category, listId, isHalfMonthly = false) {
    try {
        const res = await fetch(`${API_BASE}/files/${category}`);
        let files = await res.json();
        
        // 如果是首页展示，限制只显示前 5 条
        if (!isHalfMonthly) {
            files = files.slice(0, 5);
        }

        globalData[category] = files; 
        const listElement = document.getElementById(listId);
        
        if (files.length === 0) {
            listElement.innerHTML = '<li style="color:#999; padding:10px 0;">暂无数据</li>';
            return;
        }

        let html = '';
        files.forEach((file, index) => {
            // 如果是半月刊，并且是第一个（最新的），则渲染到PDF预览区
            if (isHalfMonthly && index === 0) {
                renderPDFViewer(file);
            }

            let linkHtml = '';
            if (file.type === 'text') {
                // 文本通知，绑定自定义属性
                linkHtml = `<a href="javascript:void(0)" class="notice-link" data-cat="${category}" data-index="${index}">
                                <span class="icon-pdf" style="color:#d32f2f">📢</span> ${file.title}
                            </a>`;
            } else {
                // 文件类型
                let targetUrl = file.pdf_path ? file.pdf_path : `/api/download/${file.id}`; // 下载改用 API
                // 注意：这里的 fileExt 建议使用真实文件名来获取，更准确
                let fileExt = file.original_name ? file.original_name.split('.').pop().toLowerCase() : 'pdf';
                const icon = file.pdf_path ? '<span class="icon-pdf">📄</span>' : '📁';
                
                // 如果是 PDF，直接打开
                if (file.pdf_path || fileExt === 'pdf') {
                    linkHtml = `<a href="${targetUrl}" target="_blank">${icon} ${file.title}</a>`;
                } 
                // 如果是图片，直接打开
                else if (['jpg','jpeg','png','gif'].includes(fileExt)) {
                    linkHtml = `<a href="${targetUrl}" target="_blank">🖼️ ${file.title}</a>`;
                }
                // 如果是 Office 文件（doc/docx/xls/xlsx/wps/ppt/pptx），调用拦截弹窗
                else {
                    linkHtml = `<a href="javascript:void(0)" onclick="showDownloadModal('${targetUrl}', '${fileExt}')">
                                    📁 ${file.title}
                                </a>`;
                }
            }

            html += `
                <li>
                    ${linkHtml}
                    <span class="date">${file.date}</span>
                </li>
            `;
        });
        listElement.innerHTML = html;
    } catch (error) {
        console.error(`加载 ${category} 失败:`, error);
    }
}

// 渲染 PDF 阅读器 (半月刊)
function renderPDFViewer(file) {
    const container = document.getElementById('pdf-container');
    if (file.pdf_path) {
        container.innerHTML = `<iframe src="${file.pdf_path}" class="pdf-viewer"></iframe>`;
    } else {
        container.innerHTML = `<p style="color:red; padding:20px;">提示：该半月刊未上传PDF格式，无法在线预览。</p>`;
    }
}

// 监听全局点击事件（专门处理文本通知，避免特殊字符报错）
document.addEventListener('click', (e) => {
    const noticeLink = e.target.closest('.notice-link');
    if (noticeLink) {
        const cat = noticeLink.getAttribute('data-cat');
        const index = noticeLink.getAttribute('data-index');
        const file = globalData[cat][index];
        
        if (file && file.type === 'text') {
            showModal(file.title, file.content);
        }
    }
});

// 显示文本详情模态框
function showModal(title, content) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-content').innerHTML = content.replace(/\n/g, '<br>');
    document.getElementById('notice-modal').style.display = 'flex';
}

// 显示下载提示框 (用于 Office 文件)
function showDownloadModal(url, ext) {
    document.getElementById('file-ext').innerText = '.' + ext;
    document.getElementById('download-link').href = url;
    document.getElementById('download-modal').style.display = 'flex';
}

// 关闭所有模态框
function closeModal() {
    document.getElementById('notice-modal').style.display = 'none';
    document.getElementById('download-modal').style.display = 'none';
}

// 初始化加载数据
window.onload = () => {
    loadFiles('notice', 'list-notice');
    loadFiles('regulation', 'list-regulation');
    loadFiles('meeting', 'list-meeting');
    loadFiles('halfmonthly', 'list-halfmonthly', true);
};