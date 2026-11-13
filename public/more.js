const API_BASE = '/api';
let allData = []; // 当前分类的所有数据
let currentPage = 1;
const pageSize = 10; // 每页10条

const catMap = {
    'notice': '通知公告',
    'regulation': '部门文件与规章',
    'meeting': '每周会议纪要'
};

// 获取 URL 参数
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// 初始化页面
async function initPage() {
    const category = getQueryParam('category');
    if (!category || !catMap[category]) {
        document.getElementById('pageTitle').innerText = '无效的分类';
        return;
    }

    document.getElementById('pageTitle').innerText = catMap[category];
    document.title = catMap[category] + ' - 装置保运部';

    try {
        const res = await fetch(`${API_BASE}/files/${category}`);
        allData = await res.json();
        renderPage(1);
    } catch (error) {
        document.getElementById('fullList').innerHTML = '<li>加载失败，请刷新重试</li>';
    }
}

// 渲染特定页的数据
function renderPage(page) {
    currentPage = page;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageData = allData.slice(start, end);

    const listElement = document.getElementById('fullList');
    if (pageData.length === 0) {
        listElement.innerHTML = '<li style="color:#999; padding:10px 0;">暂无数据</li>';
    } else {
        let html = '';
        pageData.forEach((file, index) => {
            const realIndex = start + index;
            
            let linkHtml = '';
            if (file.type === 'text') {
                // 文本通知
                linkHtml = `<a href="javascript:void(0)" onclick="showModal(${realIndex})">
                                <span class="icon-pdf" style="color:#d32f2f">📢</span> ${file.title}
                            </a>`;
            } else {
                // 文件类型
                // 如果是有 PDF 就预览 PDF，如果没有 PDF 就走下载 API
                let targetUrl = file.pdf_path ? file.pdf_path : `${API_BASE}/download/${file.id}`;
                // 使用真实文件名获取后缀，避免物理文件名无后缀导致逻辑错误
                let fileExt = file.original_name ? file.original_name.split('.').pop().toLowerCase() : 'pdf';
                const icon = file.pdf_path ? '<span class="icon-pdf">📄</span>' : '📁';
                
                if (file.pdf_path || fileExt === 'pdf') {
                    linkHtml = `<a href="${targetUrl}" target="_blank">${icon} ${file.title}</a>`;
                } else if (['jpg','jpeg','png','gif'].includes(fileExt)) {
                    linkHtml = `<a href="${targetUrl}" target="_blank">🖼️ ${file.title}</a>`;
                } else {
                    // Office 文件，拦截并弹窗引导下载
                    linkHtml = `<a href="javascript:void(0)" onclick="showDownloadModal('${targetUrl}', '${fileExt}')">
                                    📁 ${file.title}
                                </a>`;
                }
            }

            html += `<li>${linkHtml}<span class="date">${file.date}</span></li>`;
        });
        listElement.innerHTML = html;
    }

    renderPagination();
}

// 渲染分页按钮
function renderPagination() {
    const totalPages = Math.ceil(allData.length / pageSize);
    const paginationEl = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let html = '';
    // 上一页
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="renderPage(${currentPage - 1})">上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="renderPage(${i})">${i}</button>`;
    }
    
    // 下一页
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="renderPage(${currentPage + 1})">下一页</button>`;
    
    paginationEl.innerHTML = html;
}

// 显示文本详情模态框
function showModal(index) {
    const file = allData[index];
    if (file && file.type === 'text') {
        document.getElementById('modal-title').innerText = file.title;
        // 将换行符替换为 <br> 以便在 HTML 中正常显示
        document.getElementById('modal-content').innerHTML = file.content.replace(/\n/g, '<br>');
        document.getElementById('notice-modal').style.display = 'flex';
    }
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

// 启动
window.onload = initPage;