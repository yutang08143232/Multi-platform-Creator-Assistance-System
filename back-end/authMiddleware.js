const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

const JWT_PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'keys/public.pem'));

const db = mysql.createConnection({
    host: '',
    user: '',
    password: '',
    database: ''
});

db.connect((err) => {
    if (err) {
        console.error('Token验证中间件数据库连接失败:', err);
    }
});

function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ code: -1, msg: '未携带Token' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ code: -1, msg: 'Token格式错误' });
    }
    
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
    } catch (err) {
        console.error(`[AuthError] Token verification failed: ${err.name} - ${err.message}`);
        return res.status(401).json({ code: -1, msg: `Token验证失败: ${err.message}` });
    }

    db.query(
        'SELECT COUNT(*) AS count FROM valid_tokens WHERE user_id = ? AND token = ?',
        [decoded.userId, token],
        (err, results) => {
            if (err) {
                console.error('检查Token白名单失败:', err);
                return res.status(500).json({ code: -1, msg: 'Token验证失败' });
            }
            
            if (results[0].count === 0) {
                return res.status(401).json({ code: -1, msg: 'Token已失效，请重新登录' });
            }

            db.query(
                'SELECT last_password_reset FROM users WHERE id = ?',
                [decoded.userId],
                (err, results) => {
                    if (err) {
                        console.error('查询用户信息失败:', err);
                        return res.status(500).json({ code: -1, msg: 'Token验证失败' });
                    }

                    if (results.length > 0 && results[0].last_password_reset) {
                        const tokenIssuedAt = new Date(decoded.iat * 1000);
                        const passwordResetAt = new Date(results[0].last_password_reset);
                        
                        if (tokenIssuedAt < passwordResetAt) {
                            return res.status(401).json({ code: -1, msg: '密码已修改，请重新登录' });
                        }
                    }

                    req.user = decoded;
                    next();
                }
            );
        }
    );
}

module.exports = verifyToken;
