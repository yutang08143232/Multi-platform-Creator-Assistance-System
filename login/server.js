const express = require('express');
const mysql = require('mysql2');
const md5 = require('md5');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = express();
app.set('trust proxy', true); // 信任 Nginx 代理
const PRIVATE_KEY = fs.readFileSync(path.join(__dirname, '../back-end/keys/private.pem'));
const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, '../back-end/keys/public.pem'));

// 数据库配置    (本来应该用env写环境变量的，但是懒得改就这样吧)
const db = mysql.createConnection({
    host: 'your host',
    user: 'your user',
    password: 'your password',
    database: 'your datebase'
});

db.connect((err) => {
    if (err) {
        console.error('MySQL连接失败:', err);
        return;
    }
    console.log('MySQL连接成功');

    db.query('CREATE DATABASE IF NOT EXISTS login_demo', (err) => {
        if (err) {
            console.error('创建数据库失败:', err);
            return;
        }

        db.changeUser({ database: 'login_demo' }, (err) => {
            if (err) {
                console.error('切换数据库失败:', err);
                return;
            }

            const createUserTable = `
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(32) NOT NULL,
                    salt VARCHAR(20) NOT NULL,
                    email VARCHAR(100) UNIQUE,
                    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            db.query(createUserTable, (err) => {
                if (err)
                    console.error('创建表失败:', err);
                else
                    console.log('用户表初始化成功');
            });
        });
    });
});

// 中间件配置
app.use(cors({
    //示例，这个是用的我自己的域名
    origin: ['null', 'https://www.yutangxiaowu.cn' , 'https://yutangxiaowu.top' ,  "http://localhost:9100" , "https://api.yutangxiaowu.cn:9100"], 
    credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'front')));

// Token验证中间件
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({ code: -1, msg: '未携带Token' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.json({ code: -1, msg: 'Token格式错误' });
    }
    try {
        const decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
        req.user = decoded;
        next();
    } catch (err) {
        return res.json({ code: -1, msg: 'Token无效或已过期' });
    }
}

// 登录接口
app.post('/api/user/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ code: -1, msg: '用户名/密码不能为空' });
    }

    const queryUser = 'SELECT id, username, password, salt FROM users WHERE username = ?';
    db.query(queryUser, [username], (err, results) => {
        if (err) return res.json({ code: -1, msg: '数据库错误' });
        if (results.length === 0) return res.json({ code: -1, msg: '用户不存在' });

        const user = results[0];
        const encryptedPwd = md5(user.salt + password);
        if (encryptedPwd !== user.password) {
            return res.json({ code: -1, msg: '密码错误' });
        }

        // 生成Token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            PRIVATE_KEY,
            { algorithm: 'RS256', expiresIn: '1d' }
        );

        res.json({
            code: 0,
            msg: '登录成功',
            data: { token }
        });
    });
});

// 邮件配置   这里是用的163
const transporter = nodemailer.createTransport({
    host: 'smtp.163.com',
    port: 465,
    secure: true,
    auth: {
        user: 'your user',
        pass: 'your pass'
    }
});

const codeStore = new Map();

function generateCode() {
    return crypto.randomInt(100000, 999999).toString();
}

// 发送验证码接口
app.post('/api/user/sendCode', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.json({ code: -1, msg: '请输入有效的邮箱' });
    }

    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ code: -1, msg: '数据库错误' });
        if (results.length > 0) {
            return res.json({ code: -1, msg: '该邮箱已注册' });
        }

        const code = generateCode();
        codeStore.set(email, { code, expire: Date.now() + 5 * 60 * 1000 });

        transporter.sendMail({
            from: '"羽棠小屋" <yutang3416026891@163.com>',
            to: email,
            subject: '注册验证码',
            text: `感谢你参与羽棠小屋的测试，为我们的web比赛提供数据支持·你的注册验证码是：${code}，5分钟内有效，再次感谢你参与本次测试`
        }, (error) => {
            if (error) {
                console.error('邮件发送失败:', error);
                return res.json({ code: -1, msg: '验证码发送失败' });
            }
            res.json({ code: 0, msg: '验证码已发送' });
        });
    });
});

// 注册接口
app.post('/api/user/register', (req, res) => {
    const { email, username, code, password } = req.body;
    const stored = codeStore.get(email);

    if (!stored || stored.code !== code || stored.expire < Date.now()) {
        return res.json({ code: -1, msg: '验证码无效或已过期' });
    }

    const salt = 'salt_' + Math.random().toString(36).substr(2, 8);
    const encryptedPwd = md5(salt + password);

    const insertUser = `
        INSERT INTO users (username, password, salt, email)
        VALUES (?, ?, ?, ?)
    `;
    db.query(insertUser, [username, encryptedPwd, salt, email], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.json({ code: -1, msg: '用户名或邮箱已存在' });
            }
            return res.json({ code: -1, msg: '注册失败' });
        }

        codeStore.delete(email);
        res.json({ code: 0, msg: '注册成功' });
    });
});

// 获取当前用户信息接口
app.get('/api/user/userInfo', verifyToken, (req, res) => {
    res.json({
        code: 0,
        data: {
            userId: req.user.userId,
            username: req.user.username
        }
    });
});

// 退出登录接口
app.post('/api/user/logout', (req, res) => {
    res.json({ code: 0, msg: '退出成功' });
});

// 忘记密码发送验证码接口
app.post('/api/user/forgotPassword', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.json({ code: -1, msg: '请输入有效的邮箱' });
    }

    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ code: -1, msg: '数据库错误' });
        if (results.length === 0) {
            return res.json({ code: -1, msg: '该邮箱未注册' });
        }

        const code = generateCode();
        codeStore.set(email, { code, expire: Date.now() + 5 * 60 * 1000 });

        transporter.sendMail({
            from: '"羽棠小屋" <yutang3416026891@163.com>',
            to: email,
            subject: '重置密码验证码',
            text: `你正在请求重置羽棠小屋账号的密码，验证码是：${code}，5分钟内有效。如非本人操作，请忽略此邮件。`
        }, (error) => {
            if (error) {
                console.error('邮件发送失败:', error);
                return res.json({ code: -1, msg: '验证码发送失败' });
            }
            res.json({ code: 0, msg: '验证码已发送' });
        });
    });
});

// 重置密码接口
app.post('/api/user/resetPassword', (req, res) => {
    const { email, code, password } = req.body;
    const stored = codeStore.get(email);

    if (!stored || stored.code !== code || stored.expire < Date.now()) {
        return res.json({ code: -1, msg: '验证码无效或已过期' });
    }

    const salt = 'salt_' + Math.random().toString(36).substr(2, 8);
    const encryptedPwd = md5(salt + password);

    const updatePassword = `
        UPDATE users 
        SET password = ?, salt = ? 
        WHERE email = ?
    `;
    db.query(updatePassword, [encryptedPwd, salt, email], (err) => {
        if (err) {
            return res.json({ code: -1, msg: '密码重置失败' });
        }

        codeStore.delete(email);
        res.json({ code: 0, msg: '密码重置成功' });
    });
});






const port = 9100;

app.listen(port, () => {
    console.log(`服务已启动：http://localhost:${port}`);
});
