const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// 读取公钥
const JWT_PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'keys/public.pem'));

// Token验证中间件
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ code: -1, msg: '未携带Token' });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ code: -1, msg: 'Token格式错误' });
    }
    try {
        const decoded = jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
        req.user = decoded; // 将解码后的用户信息挂载到 req 对象
        next();
    } catch (err) {
        console.error(`[AuthError] Token verification failed for token: ${token.substring(0, 20)}...`);
        console.error(`[AuthError] Error details: ${err.name} - ${err.message}`);
        console.error(`[AuthError] Token expiredAt: ${err.expiredAt}`);
        return res.status(401).json({ code: -1, msg: `Token验证失败: ${err.message}` });
    }
}

module.exports = verifyToken;
