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

// 数据库配置
const db = mysql.createConnection({
    host: '115.159.73.119',
    user: 'root',
    password: 'lz13896248574',
    database: 'login_demo'
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
                    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_password_reset TIMESTAMP NULL
                )
            `;
            const createTokenBlacklistTable = `
                CREATE TABLE IF NOT EXISTS token_blacklist (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    token VARCHAR(500) NOT NULL,
                    invalidated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `;
            const createValidTokensTable = `
                CREATE TABLE IF NOT EXISTS valid_tokens (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    token VARCHAR(500) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `;
            db.query(createUserTable, (err) => {
                if (err)
                    console.error('创建用户表失败:', err);
                else
                    console.log('用户表初始化成功');
            });
            db.query(createTokenBlacklistTable, (err) => {
                if (err)
                    console.error('创建token黑名单表失败:', err);
                else
                    console.log('token黑名单表初始化成功');
            });
            db.query(createValidTokensTable, (err) => {
                if (err)
                    console.error('创建token白名单表失败:', err);
                else
                    console.log('token白名单表初始化成功');
            });
        });
    });
});

// 中间件配置
app.use(cors({
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

const MAX_VALID_TOKENS = 3;

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

        const token = jwt.sign(
            { userId: user.id, username: user.username },
            PRIVATE_KEY,
            { algorithm: 'RS256', expiresIn: '1d' }
        );

        db.query(
            'SELECT COUNT(*) AS count FROM valid_tokens WHERE user_id = ?',
            [user.id],
            (err, countResults) => {
                if (err) {
                    console.error('查询token数量失败:', err);
                    return res.json({ code: -1, msg: '登录失败' });
                }

                const tokenCount = countResults[0].count;

                if (tokenCount >= MAX_VALID_TOKENS) {
                    db.query(
                        'INSERT INTO token_blacklist (user_id, token) SELECT user_id, token FROM valid_tokens WHERE user_id = ? ORDER BY created_at ASC LIMIT 1',
                        [user.id],
                        (err) => {
                            if (err) console.error('加入黑名单失败:', err);
                        }
                    );

                    db.query(
                        'DELETE FROM valid_tokens WHERE user_id = ? ORDER BY created_at ASC LIMIT 1',
                        [user.id],
                        (err) => {
                            if (err) {
                                console.error('删除旧token失败:', err);
                                return res.json({ code: -1, msg: '登录失败' });
                            }
                            saveNewToken(user.id, token, res);
                        }
                    );
                } else {
                    saveNewToken(user.id, token, res);
                }
            }
        );
    });
});

function saveNewToken(userId, token, res) {
    db.query(
        'INSERT INTO valid_tokens (user_id, token) VALUES (?, ?)',
        [userId, token],
        (err) => {
            if (err) {
                console.error('存储token失败:', err);
                return res.json({ code: -1, msg: '登录失败' });
            }
            res.json({
                code: 0,
                msg: '登录成功',
                data: { token }
            });
        }
    );
}

// 检查Token是否在黑名单中
function isTokenBlacklisted(token, userId, callback) {
    db.query(
        'SELECT COUNT(*) AS count FROM token_blacklist WHERE user_id = ? AND token = ?',
        [userId, token],
        (err, results) => {
            if (err) return callback(err, null);
            callback(null, results[0].count > 0);
        }
    );
}

// Token验证中间件（带黑名单检查）
function verifyTokenWithBlacklist(req, res, next) {
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
        
        isTokenBlacklisted(token, decoded.userId, (err, isBlacklisted) => {
            if (err) {
                console.error('检查Token黑名单失败:', err);
                return res.json({ code: -1, msg: 'Token验证失败' });
            }
            if (isBlacklisted) {
                return res.json({ code: -1, msg: 'Token已失效，请重新登录' });
            }
            next();
        });
    } catch (err) {
        return res.json({ code: -1, msg: 'Token无效或已过期' });
    }
}

// 邮件配置
const transporter = nodemailer.createTransport({
    host: 'smtp.163.com',
    port: 465,
    secure: true,
    auth: {
        user: 'yutang3416026891@163.com',
        pass: 'LGRdK32p3AdBwhg9'
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
app.get('/api/user/userInfo', verifyTokenWithBlacklist, (req, res) => {
    res.json({
        code: 0,
        data: {
            userId: req.user.userId,
            username: req.user.username
        }
    });
});

// 退出登录接口（将当前token加入黑名单并从白名单删除）
app.post('/api/user/logout', verifyTokenWithBlacklist, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    const userId = req.user.userId;
    
    db.query(
        'INSERT INTO token_blacklist (user_id, token) VALUES (?, ?)',
        [userId, token],
        (err) => {
            if (err) {
                console.error('加入黑名单失败:', err);
            }
        }
    );
    
    db.query(
        'DELETE FROM valid_tokens WHERE user_id = ? AND token = ?',
        [userId, token],
        (err) => {
            if (err) {
                console.error('从白名单删除失败:', err);
                return res.json({ code: -1, msg: '退出失败' });
            }
            res.json({ code: 0, msg: '退出成功' });
        }
    );
});

// 失效用户所有token（用于密码重置等场景）
function invalidateAllUserTokens(userId, callback) {
    db.query(
        'INSERT INTO token_blacklist (user_id, token) SELECT user_id, token FROM valid_tokens WHERE user_id = ?',
        [userId],
        (err) => {
            if (err) return callback(err);
            db.query(
                'DELETE FROM valid_tokens WHERE user_id = ?',
                [userId],
                callback
            );
        }
    );
}

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

    db.query('SELECT id FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.json({ code: -1, msg: '数据库错误' });
        if (results.length === 0) return res.json({ code: -1, msg: '用户不存在' });

        const userId = results[0].id;

        const updatePassword = `
            UPDATE users 
            SET password = ?, salt = ?, last_password_reset = NOW() 
            WHERE email = ?
        `;
        db.query(updatePassword, [encryptedPwd, salt, email], (err) => {
            if (err) {
                return res.json({ code: -1, msg: '密码重置失败' });
            }

            db.query(
                'INSERT INTO token_blacklist (user_id, token) SELECT user_id, token FROM valid_tokens WHERE user_id = ?',
                [userId],
                (err) => {
                    if (err) console.error('加入黑名单失败:', err);
                }
            );

            db.query(
                'DELETE FROM valid_tokens WHERE user_id = ?',
                [userId],
                (err) => {
                    if (err) {
                        console.error('删除有效token失败:', err);
                        return res.json({ code: -1, msg: '密码重置失败' });
                    }

                    codeStore.delete(email);
                    res.json({ code: 0, msg: '密码重置成功，请重新登录' });
                }
            );
        });
    });
});






const port = 9100;

app.listen(port, () => {
    console.log(`服务已启动：http://localhost:${port}`);
});
