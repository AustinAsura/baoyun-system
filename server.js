const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;

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
    else res.status(401).json({ message: '未登录' });
};
const checkAuthPage = (req, res, next) => {
    if (req.session.isAdmin) next();
    else res.redirect('/login.html');
};

// 拦截后台页面（必须在静态文件前）
app.get('/admin.html', checkAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static('public')); 
app.use('/uploads', express.static('uploads'));

// 确保目录存在
const dirs = ['uploads/original', 'uploads/pdf'];
dirs.forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });
if (!fs.existsSync('data.json')) fs.writeFileSync('data.json', '[]');

// 配置 Multer (支持接收两个文件)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'original_file') cb(null, 'uploads/original/');
        else cb(null, 'uploads/pdf/');
    },
    filename: (req, file, cb) => {
        // 1. 修复中文乱码
        let originalName = file.originalname;
        try {
            originalName = Buffer.from(originalName, 'latin1').toString('utf8');
        } catch (e) {}
        // 把修复好的名字挂载到 file 对象上，后面取用
        file.fixedOriginalName = originalName; 

        // 2. 物理文件重命名：时间戳_随机数.后缀 (服务器硬盘上不再出现中文，彻底杜绝乱码)
        const ext = path.extname(originalName);
        cb(null, `${Date.now()}_${Math.round(Math.random() * 10000)}${ext}`);
    }
});
const upload = multer({ storage: storage }).fields([
    { name: 'original_file', maxCount: 1 },
    { name: 'pdf_file', maxCount: 1 }
]);

// --- 登录/登出 ---
app.post('/api/login', (req, res) => {
    if (req.body.username === 'admin' && req.body.password === '123456') {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else res.status(401).json({ success: false, message: '账号或密码错误' });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// --- 发布纯文本通知 ---
app.post('/api/publish-notice', checkAuthAPI, (req, res) => {
    const { title, content } = req.body;
    const newNotice = {
        id: Date.now().toString(),
        type: 'text', // 标识为文本类型
        title: title,
        content: content,
        date: new Date().toISOString().split('T')[0]
    };
    const data = JSON.parse(fs.readFileSync('data.json'));
    data.push(newNotice);
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    res.json({ success: true, message: '通知发布成功' });
});

// --- 上传文件（双文件） ---
app.post('/api/upload-file', checkAuthAPI, upload, (req, res) => {
    const { title, category, date } = req.body;
    
    if (!req.files || (!req.files['original_file'] && !req.files['pdf_file'])) {
        return res.status(400).json({ message: '至少需要上传一个文件' });
    }

    const newFile = {
        id: Date.now().toString(),
        type: 'file',
        title: title,
        category: category,
        date: date || new Date().toISOString().split('T')[0],
        original_path: req.files['original_file'] ? `/uploads/original/${req.files['original_file'][0].filename}` : null,
        // 这里改用 fixedOriginalName，保存真实的中文名进数据库
        original_name: req.files['original_file'] ? req.files['original_file'][0].fixedOriginalName : null,
        pdf_path: req.files['pdf_file'] ? `/uploads/pdf/${req.files['pdf_file'][0].filename}` : null
    };

    const data = JSON.parse(fs.readFileSync('data.json'));
    data.push(newFile);
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    res.json({ success: true, message: '上传成功' });
});

// --- 获取列表数据 ---
// 获取所有数据（供后台列表使用）
app.get('/api/all-data', checkAuthAPI, (req, res) => {
    const data = JSON.parse(fs.readFileSync('data.json'));
    // 按日期降序，如果日期相同，按 id (发布时的时间戳) 降序
    const sortedData = data.sort((a, b) => {
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        return parseInt(b.id) - parseInt(a.id); 
    });
    res.json(sortedData);
});

// --- 专门的下载接口 (解决中文乱码) ---
app.get('/api/download/:id', (req, res) => {
    const id = req.params.id;
    const data = JSON.parse(fs.readFileSync('data.json'));
    const target = data.find(d => d.id === id);
    
    if (!target || !target.original_path) {
        return res.status(404).send('文件不存在');
    }

    const filePath = path.join(__dirname, target.original_path);
    
    if (fs.existsSync(filePath)) {
        // res.download 第二个参数是文件名，Express 会自动处理 Content-Disposition 的中文编码
        res.download(filePath, target.original_name, (err) => {
            if (err) {
                res.status(500).send('下载失败');
            }
        });
    } else {
        res.status(404).send('物理文件丢失');
    }
});

// 获取分类数据（供前台使用）
app.get('/api/files/:category', (req, res) => {
    const category = req.params.category;
    const data = JSON.parse(fs.readFileSync('data.json'));
    
    let result = [];
    if (category === 'notice') {
        result = data.filter(d => d.type === 'text' || d.category === 'notice');
    } else {
        result = data.filter(d => d.type === 'file' && d.category === category);
    }
    
    // 同样：先按日期降序，再按发布时间戳(id)降序
    const sortedResult = result.sort((a, b) => {
        const dateCompare = new Date(b.date) - new Date(a.date);
        if (dateCompare !== 0) return dateCompare;
        return parseInt(b.id) - parseInt(a.id);
    });

    res.json(sortedResult);
});

// --- 删除数据 ---
app.delete('/api/delete/:id', checkAuthAPI, (req, res) => {
    const id = req.params.id;
    let data = JSON.parse(fs.readFileSync('data.json'));
    const target = data.find(d => d.id === id);
    
    if (target) {
        // 删除物理文件
        if (target.original_path) {
            const p1 = path.join(__dirname, target.original_path);
            if (fs.existsSync(p1)) fs.unlinkSync(p1);
        }
        if (target.pdf_path) {
            const p2 = path.join(__dirname, target.pdf_path);
            if (fs.existsSync(p2)) fs.unlinkSync(p2);
        }
        
        data = data.filter(d => d.id !== id);
        fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
        res.json({ success: true });
    } else res.status(404).json({ message: '未找到' });
});

app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 系统已成功启动！`);
    console.log(`🌐 前台访问地址: http://localhost:${PORT}/index.html`);
    console.log(`🔒 后台管理地址: http://localhost:${PORT}/login.html`);
    console.log(`=========================================\n`);
});