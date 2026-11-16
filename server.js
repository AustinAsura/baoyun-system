require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化 Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'baoyun-secret-key-123',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 2 * 60 * 60 * 1000 }
}));

// --- 鉴权中间件 ---
const checkAuthAPI = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.status(401).json({ message: '未登录或登录已过期' });
};
const checkAuthPage = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.redirect('/login.html');
};

// 拦截后台页面
app.get('/admin.html', checkAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 托管静态前端文件
app.use(express.static('public')); 

// 配置 Multer (使用内存存储，不存本地硬盘)
const upload = multer({ storage: multer.memoryStorage() }).fields([
    { name: 'original_file', maxCount: 1 },
    { name: 'pdf_file', maxCount: 1 }
]);

// 辅助函数：上传文件到 Supabase Storage
async function uploadToSupabase(file) {
    // 修复中文乱码
    let originalName = file.originalname;
    try {
        originalName = Buffer.from(originalName, 'latin1').toString('utf8');
    } catch (e) {}

    // 生成唯一文件名 (时间戳_随机数.后缀)
    const ext = path.extname(originalName);
    const fileName = `${Date.now()}_${Math.round(Math.random() * 10000)}${ext}`;

    // 上传到 Supabase 的 uploads 桶
    const { data, error } = await supabase.storage
        .from('uploads')
        .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false
        });

    if (error) throw new Error(`文件上传失败: ${error.message}`);

    // 获取公开访问 URL
    const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(fileName);

    return {
        url: urlData.publicUrl,
        name: originalName,
        fileName: fileName // 用于后续删除时定位文件
    };
}

// --- 登录/登出 ---
app.post('/api/login', (req, res) => {
    if (req.body.username === 'administrator' && req.body.password === 'admin@123!') {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else res.status(401).json({ success: false, message: '账号或密码错误' });
});

app.post('/api/logout', (req, res) => { 
    req.session.destroy(); 
    res.json({ success: true }); 
});

// --- 1. 发布纯文本通知 ---
app.post('/api/publish-notice', checkAuthAPI, async (req, res) => {
    const { title, content } = req.body;
    
    // 插入数据库
    const { error } = await supabase
        .from('files')
        .insert([{
            type: 'text',
            title: title,
            content: content,
            date: new Date().toISOString().split('T')[0]
        }]);

    if (error) return res.status(500).json({ message: '发布失败', error });
    res.json({ success: true, message: '通知发布成功' });
});

// --- 2. 上传文件（双文件处理） ---
app.post('/api/upload-file', checkAuthAPI, upload, async (req, res) => {
    try {
        const { title, category, date } = req.body;
        
        if (!req.files || (!req.files['original_file'] && !req.files['pdf_file'])) {
            return res.status(400).json({ message: '至少需要上传一个文件' });
        }

        let originalData = null;
        let pdfData = null;

        // 上传原始文件
        if (req.files['original_file']) {
            originalData = await uploadToSupabase(req.files['original_file'][0]);
        }

        // 上传 PDF 预览版
        if (req.files['pdf_file']) {
            pdfData = await uploadToSupabase(req.files['pdf_file'][0]);
        }

        // 写入数据库
        const { error } = await supabase
            .from('files')
            .insert([{
                type: 'file',
                title: title,
                category: category,
                date: date || new Date().toISOString().split('T')[0],
                original_path: originalData ? originalData.url : null,
                original_name: originalData ? originalData.name : null,
                pdf_path: pdfData ? pdfData.url : null
            }]);

        if (error) throw error;
        res.json({ success: true, message: '上传成功' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: '上传过程中发生错误', error: err.message });
    }
});

// --- 3. 获取数据列表 ---

// 供后台使用：获取所有数据
app.get('/api/all-data', checkAuthAPI, async (req, res) => {
    const { data, error } = await supabase
        .from('files')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }); // 依赖新增的创建时间字段

    if (error) return res.status(500).json({ message: '获取数据失败' });
    res.json(data);
});

// 供前台使用：获取分类数据
app.get('/api/files/:category', async (req, res) => {
    const category = req.params.category;
    let query = supabase.from('files').select('*');

    if (category === 'notice') {
        // 通知公告：包含纯文本和分类为 notice 的文件
        query = query.or(`type.eq.text,category.eq.notice`);
    } else {
        // 其他分类：只查对应的文件
        query = query.eq('type', 'file').eq('category', category);
    }

    const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ message: '获取数据失败' });
    res.json(data);
});

// --- 4. 删除数据 ---
app.delete('/api/delete/:id', checkAuthAPI, async (req, res) => {
    const id = req.params.id;

    // 先查出数据，为了获取要删除的云端文件路径
    const { data: record, error: fetchError } = await supabase
        .from('files')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !record) return res.status(404).json({ message: '数据不存在' });

    // 1. 从数据库删除
    const { error: deleteError } = await supabase.from('files').delete().eq('id', id);
    if (deleteError) return res.status(500).json({ message: '数据库删除失败' });

    // 2. 从 Storage 删除物理文件
    if (record.original_path) {
        const originalFileName = record.original_path.split('/').pop();
        await supabase.storage.from('uploads').remove([originalFileName]);
    }
    if (record.pdf_path) {
        const pdfFileName = record.pdf_path.split('/').pop();
        await supabase.storage.from('uploads').remove([pdfFileName]);
    }

    res.json({ success: true });
});

// --- 5. 下载中转接口 (重定向到云端URL) ---
app.get('/api/download/:id', async (req, res) => {
    const id = req.params.id;
    const { data, error } = await supabase.from('files').select('original_path').eq('id', id).single();
    
    if (error || !data || !data.original_path) {
        return res.status(404).send('文件不存在');
    }
    
    // 直接重定向到 Supabase 的文件公开链接
    res.redirect(data.original_path);
});

// 启动服务
app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 系统已成功启动 (连接至 Supabase 云端)!`);
    console.log(`🌐 前台访问地址: http://localhost:${PORT}/index.html`);
    console.log(`🔒 后台管理地址: http://localhost:${PORT}/login.html`);
    console.log(`=========================================\n`);
});
