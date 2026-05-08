const express = require('express');
const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');
const cors = require('cors');
const verifyToken = require('./authMiddleware');
const fs = require('fs');
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
require('dotenv').config({ path: './env.env' });

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 本地数据库配置
const dbConfig = {
    host: '115.159.73.119',       // 本地数据库主机
    user: process.env.DB_USER,            // 本地数据库用户名
    password: process.env.DB_PASSWORD, // 本地数据库密码
    database: 'api_call_stats', // 数据库名
    connectTimeout: 10000,       // 连接超时设置
    waitForConnections: true,     // 启用等待连接
    connectionLimit: 10,      // 最大连接数
    queueLimit: 0      // 无限制排队
};

const dbConfigVideo = {
    host: '115.159.73.119',       // 本地数据库主机
    user: process.env.DB_USER,            // 本地数据库用户名
    password: process.env.DB_PASSWORD, // 本地数据库密码
    database: 'data_video', // 数据库名
    connectTimeout: 10000,       // 连接超时设置
    waitForConnections: true,     // 启用等待连接
    connectionLimit: 10,      // 最大连接数
    queueLimit: 0      // 无限制排队
};

const dbConfigCookie = {
    host: '115.159.73.119',       // 本地数据库主机
    user: process.env.DB_USER,            // 本地数据库用户名
    password: process.env.DB_PASSWORD, // 本地数据库密码
    database: 'cookie_list', // 数据库名
    connectTimeout: 10000,       // 连接超时设置
    waitForConnections: true,     // 启用等待连接
    connectionLimit: 10,      // 最大连接数
    queueLimit: 0      // 无限制排队
};

const poolBiliVideo = mysqlPromise.createPool(dbConfigVideo);
const poolDouyinVideo = mysqlPromise.createPool(dbConfigVideo);
const pool = mysqlPromise.createPool(dbConfig);
const poolCookie = mysqlPromise.createPool(dbConfigCookie);


// 创建数据解析表
// 接口：接收视频数据并写入数据库（包含 user_id）
app.post('/api/bili/video', verifyToken, async (req, res) => {
    try {
        // 从请求体中获取数据（包含用户字段 user_id）
        const { data } = req.body;
        // 强制使用Token中的用户名
        const user_id = req.user.username;
        console.log(user_id);

        // 验证必填字段
        if (!user_id || !data) {
            return res.status(400).json({
                error: '缺少必填字段',
                required: ['user_id', 'data']
            });
        }

        // 提取视频相关字段
        const { bvid, aid, cid, video, owner, stat, type } = data;

        // 验证嵌套字段是否存在
        if (!video || !owner || !stat) {
            return res.status(400).json({ error: '数据格式错误，缺少嵌套字段' });
        }

        // 插入或更新数据库（基于 user_id+bvid+cid 联合唯一约束）
        const [rows, fields] = await poolBiliVideo.execute(`
  INSERT INTO video_bili_data (
    user_id, bvid, aid, cid, title, fm, lx, \`desc\`, max_qxd, url,
    owner_name, owner_mid, owner_face,
    view, danmaku, reply, favorite, coin, \`share\`, \`like\`, \`time\`, \`type\`
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    -- 移除user_id更新（联合唯一约束保证user_id不会冲突）
    aid = VALUES(aid),
    title = VALUES(title),
    fm = VALUES(fm),
    lx = VALUES(lx),
    \`desc\` = VALUES(\`desc\`),
    max_qxd = VALUES(max_qxd),
    url = VALUES(url),
    owner_name = VALUES(owner_name),
    owner_mid = VALUES(owner_mid),
    owner_face = VALUES(owner_face),
    view = VALUES(view),
    danmaku = VALUES(danmaku),
    reply = VALUES(reply),
    favorite = VALUES(favorite),
    coin = VALUES(coin),
    \`share\` = VALUES(\`share\`),
    \`like\` = VALUES(\`like\`),
    \`time\` = VALUES(\`time\`),
    \`type\` = VALUES(\`type\`)
`, [
            user_id,
            bvid,
            aid,
            cid,
            video.title,
            video.fm,
            video.lx,
            video.desc,
            video.max_qxd,
            video.url,
            owner.name,
            owner.mid,
            owner.face,
            stat.view,
            stat.danmaku,
            stat.reply,
            stat.favorite,
            stat.coin,
            stat.share,
            stat.like,
            stat.time,
            type
        ]);

        // 判断是插入还是更新，并精准获取当前用户+视频的ID
        let message, video_id, action;
        if (rows.affectedRows === 1) {
            // 新插入（无重复的user_id+bvid+cid）
            message = '数据写入成功';
            video_id = rows.insertId;
            action = 'insert';
        } else {
            // 更新（同一user_id+bvid+cid存在）
            message = '数据更新成功';
            // 精准查询：仅查当前用户的该视频记录
            const [result] = await poolBiliVideo.execute(
                'SELECT id FROM video_bili_data WHERE user_id = ? AND bvid = ? AND cid = ?',
                [user_id, bvid, cid]
            );
            video_id = result[0]?.id;
            action = 'update';
        }

        res.status(200).json({
            message: message,
            data: {
                user_id,
                video_id: video_id,
                bvid: bvid,
                cid: cid, // 补充cid，返回信息更完整
                action: action
            }
        });

    } catch (error) {
        console.error('视频数据操作异常：', error); // 增加日志便于排查
        res.status(500).json({
            error: '数据操作失败',
            details: process.env.NODE_ENV === 'production' ? '服务器内部错误' : error.message
        });
    }
});
// 抖音数据写入数据库
app.post('/api/douyin/video', verifyToken, async (req, res) => {
    try {
        const { data } = req.body;
        // 强制使用Token中的用户名
        const user_id = req.user.username;
        
        // 验证必填字段
        if (!user_id || !data) {
            return res.status(400).json({ 
                error: '缺少必填字段', 
                required: ['user_id', 'data'] 
            });
        }

        const { vid, video, owner, stat, type } = data;
        // 验证嵌套核心字段
        if (!vid || !video || !owner || !stat) {
            return res.status(400).json({ 
                error: '数据格式错误，缺少嵌套字段',
                missing: !vid ? 'vid' : (!video ? 'video' : (!owner ? 'owner' : 'stat'))
            });
        }

        // 格式化时间（兼容空值，避免日期格式错误）
        const statTime = stat.time 
            ? new Date(stat.time).toISOString().split('T')[0] 
            : null;

        // 插入/更新数据库（基于 user_id+vid 联合唯一约束）
        const [rows] = await poolDouyinVideo.execute(`
            INSERT INTO video_douyin_data (
                user_id, vid, title, fm, lx, \`desc\`, max_qxd, url,
                owner_name, owner_mid, owner_face,
                reply, favorite, recommend, \`share\`, \`like\`, \`time\`, \`type\`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                fm = VALUES(fm),
                lx = VALUES(lx),
                \`desc\` = VALUES(\`desc\`),
                max_qxd = VALUES(max_qxd),
                url = VALUES(url),
                owner_name = VALUES(owner_name),
                owner_mid = VALUES(owner_mid),
                owner_face = VALUES(owner_face),
                reply = VALUES(reply),
                favorite = VALUES(favorite),
                recommend = VALUES(recommend),
                \`share\` = VALUES(\`share\`),
                \`like\` = VALUES(\`like\`),
                \`time\` = VALUES(\`time\`),
                \`type\` = VALUES(\`type\`)
        `, [
            user_id,
            vid,
            video.title || '',        // 空值兜底
            video.fm || '',
            video.lx || '',
            video.desc || '',
            video.max_qxd || '',
            video.url || '',
            owner.name || '',
            parseInt(owner.mid, 10) || 0, // 数字类型兜底
            owner.face || '',
            stat.reply || 0,          // 数值字段兜底
            stat.favorite || 0,
            stat.recommend || 0,
            stat.share || 0,
            stat.like || 0,
            statTime,
            type || ''
        ]);

        // 判断操作类型，并精准获取当前用户+视频的ID
        let message, video_id, action;
        if (rows.affectedRows === 1) {
            // 新插入（无重复的 user_id+vid）
            action = 'insert';
            message = '数据写入成功';
            video_id = rows.insertId;
        } else {
            // 更新（同一 user_id+vid 已存在）
            action = 'update';
            message = '数据更新成功';
            // 精准查询当前用户该视频的ID（避免跨用户取错）
            const [result] = await poolDouyinVideo.execute(
                'SELECT id FROM video_douyin_data WHERE user_id = ? AND vid = ?',
                [user_id, vid]
            );
            video_id = result[0]?.id || null;
        }

        // 返回标准化响应
        res.status(200).json({
            message: message,
            data: {
                user_id,
                video_id: video_id,
                vid: vid,
                action: action // 统一返回英文标识，便于前端处理
            }
        });
    } catch (error) {
        console.error('抖音视频数据操作异常:', error);
        // 生产环境隐藏敏感错误详情
        const errorDetails = process.env.NODE_ENV === 'production' 
            ? '服务器内部错误' 
            : error.message;
        res.status(500).json({ 
            error: '数据处理失败', 
            details: errorDetails 
        });
    }
});

// 快手数据写入数据库
app.post('/api/kuaishou/video', verifyToken, async (req, res) => {
    try {
        const { data } = req.body;
        // 强制使用Token中的用户名
        const user_id = req.user.username;

        if (!user_id || !data) {
            return res.status(400).json({ error: '缺少必填字段', required: ['user_id', 'data'] });
        }
        
        const { vid, video, owner, stat, createTime, images, songName, audioUrl } = data;
        
        // 简单验证关键字段
        if (!video || !owner || !stat) {
             return res.status(400).json({ error: '数据格式错误，缺少嵌套字段' });
        }

        const [rows] = await poolDouyinVideo.query(`
            INSERT INTO video_kuaishou_data (
                user_id, vid, title, url, fm, duration, 
                owner_name, view_count, like_count, comment_count, share_count,
                create_time, images, song_name, audio_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                url = VALUES(url),
                fm = VALUES(fm),
                duration = VALUES(duration),
                owner_name = VALUES(owner_name),
                view_count = VALUES(view_count),
                like_count = VALUES(like_count),
                comment_count = VALUES(comment_count),
                share_count = VALUES(share_count),
                create_time = VALUES(create_time),
                images = VALUES(images),
                song_name = VALUES(song_name),
                audio_url = VALUES(audio_url)
        `, [
            user_id,
            vid,
            video.title || '',
            video.url || '',
            video.fm || '',
            video.duration || '',
            owner.name || '',
            stat.view || '0',
            stat.like || '0',
            stat.comment || '0',
            stat.share || '0',
            createTime || null,
            JSON.stringify(images || []),
            songName || '',
            audioUrl || ''
        ]);

        const action = rows.affectedRows === 1 ? 'insert' : 'update';

        res.status(200).json({
            message: `快手数据${action === 'insert' ? '写入' : '更新'}成功`,
            data: { user_id, vid, action }
        });

    } catch (error) {
        console.error('快手数据插入/更新错误:', error);
        res.status(500).json({ error: '数据处理失败', details: error.message });
    }
});

// 小红书数据写入数据库
app.post('/api/xiaohongshu/video', verifyToken, async (req, res) => {
    try {
        const { data } = req.body;
        // 强制使用Token中的用户名
        const user_id = req.user.username;

        if (!user_id || !data) {
            return res.status(400).json({ error: '缺少必填字段', required: ['user_id', 'data'] });
        }
        
        const { vid, video, owner, stat, createTime, images, songName, audioUrl } = data;
        
        // 简单验证关键字段
        if (!video || !owner || !stat) {
             return res.status(400).json({ error: '数据格式错误，缺少嵌套字段' });
        }

        // 处理时间戳，转换为datetime格式
        let createTimeFormatted = null;
        if (createTime) {
            // 检查是否是时间戳（数字或数字字符串）
            const timestamp = parseInt(createTime);
            if (!isNaN(timestamp)) {
                // 如果是毫秒级时间戳，转换为秒级
                const seconds = timestamp > 1000000000000 ? timestamp / 1000 : timestamp;
                createTimeFormatted = new Date(seconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
            } else {
                createTimeFormatted = createTime;
            }
        }

        const [rows] = await poolDouyinVideo.query(`
            INSERT INTO video_xiaohongshu_data (
                user_id, vid, title, url, fm, duration, 
                owner_name, like_count, comment_count, share_count,
                create_time, images, song_name, audio_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                url = VALUES(url),
                fm = VALUES(fm),
                duration = VALUES(duration),
                owner_name = VALUES(owner_name),
                like_count = VALUES(like_count),
                comment_count = VALUES(comment_count),
                share_count = VALUES(share_count),
                create_time = VALUES(create_time),
                images = VALUES(images),
                song_name = VALUES(song_name),
                audio_url = VALUES(audio_url)
        `, [
            user_id,
            vid,
            video.title || '',
            video.url || '',
            video.fm || '',
            video.duration || '',
            owner.name || '',
            stat.like || '0',
            stat.comment || '0',
            stat.share || '0',
            createTimeFormatted || null,
            JSON.stringify(images || []),
            songName || '',
            audioUrl || ''
        ]);

        const action = rows.affectedRows === 1 ? 'insert' : 'update';

        res.status(200).json({
            message: `小红书数据${action === 'insert' ? '写入' : '更新'}成功`,
            data: { user_id, vid, action }
        });

    } catch (error) {
        console.error('小红书数据插入/更新错误:', error);
        res.status(500).json({ error: '数据处理失败', details: error.message });
    }
});

// 获取所有小红书视频数据
app.get('/api/4c/video/xiaohongshu', verifyToken, async (req, res) => {
    try {
        const username = req.user.username;
        // 解析参数，设置默认值
        const {
            num = 10,       // 每页条数
            page = 1,       // 页码（默认第一页）
            keyword = ''    // 搜索关键词
        } = req.query;

        const actualUserId = username;

        // 边界处理：每页条数限制 1-100，页码限制 ≥1
        const limitNum = Math.max(1, Math.min(100, parseInt(num, 10) || 10));
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        // 计算偏移量（跳过前面多少条数据）
        const offsetNum = (pageNum - 1) * limitNum;

        // 构建 SQL 语句和参数
        let sql = 'SELECT * FROM video_xiaohongshu_data WHERE user_id = ?';
        const sqlParams = [actualUserId];

        // 关键词搜索（匹配标题、描述、分类）
        if (keyword.trim()) {
            sql += ' AND (title LIKE ? OR owner_name LIKE ?)';
            const likeStr = `%${keyword.trim()}%`;
            sqlParams.push(likeStr, likeStr);
        }

        // 排序 + 分页（LIMIT 偏移量, 每页条数）
        sql += ' ORDER BY created_at DESC LIMIT ?, ?';
        sqlParams.push(offsetNum, limitNum);

        // 执行查询（使用async/await处理Promise）
        const [results] = await poolDouyinVideo.query(sql, sqlParams);
        res.json({
            data: results,
            pagination: {
                page: pageNum,       // 当前页码
                pageSize: limitNum,  // 每页条数
                total: results.length // 当前页实际返回条数（如需总条数需额外查询）
            }
        });
    } catch (err) {
        console.error('Query error:', err);
        res.status(500).json({ error: '查询数据库失败', details: err.message });
    }
});

// 记录API调用
app.post('/api/log-call', (req, res) => {
    const { user_id, api_endpoint } = req.body;

    if (!user_id || !api_endpoint) {
        return res.status(400).json({ error: 'user_id and api_endpoint are required' });
    }

    pool.query(
        `INSERT INTO api_calls (user_id, api_endpoint, call_count, last_called)     
         VALUES (?, ?, 1, NOW()) 
         ON DUPLICATE KEY UPDATE 
         call_count = call_count + 1, 
         last_called = NOW()`,
        [user_id, api_endpoint],
        (error, results) => {
            if (error) {
                console.error('Database error:', error);
                return res.status(500).json({ error: '数据库错误' });
            }

            pool.query(
                'SELECT call_count FROM api_calls WHERE user_id = ? AND api_endpoint = ?',
                [user_id, api_endpoint],
                (err, countResult) => {
                    if (err) {
                        console.error('Count query error:', err);
                        return res.status(200).json({
                            message: 'API调用记录成功',
                            count: null
                        });
                    }

                    res.status(200).json({
                        message: 'API调用记录成功',
                        count: countResult[0]?.call_count
                    });
                }
            );
        }
    );
});

// 获取所有调用统计
app.get('/api/count', (req, res) => {
    const sql = 'SELECT * FROM api_calls';
    pool.query(sql, (err, results) => {
        if (err) {
            console.error('Query error:', err);
            res.status(500).json({ error: '查询数据库失败' });
            return;
        }

        res.json(results);
    });
});

// 获取所有B站视频数据
app.get('/api/4c/video/bili', verifyToken, async (req, res) => {
    try {
        // 从 Token 中获取用户名，不再信任前端传递的 username
        const username = req.user.username;
        // 解析参数，设置默认值
        const {
            page = 1,
            num = 10,
            keyword = '',
            sort = 'default' // 默认排序
        } = req.query;

        // 使用Token中的username作为查询条件
        const actualUserId = username;
        // 边界处理：每页条数限制 1-100，页码限制 ≥1
        const limitNum = Math.max(1, Math.min(100, isNaN(parseInt(num, 10)) ? 10 : parseInt(num, 10)));
        const pageNum = Math.max(1, isNaN(parseInt(page, 10)) ? 1 : parseInt(page, 10));
        // 计算偏移量（跳过前面多少条数据）
        const offsetNum = (pageNum - 1) * limitNum;

        // 构建 SQL 语句和参数
        let sql = 'SELECT * FROM video_bili_data WHERE user_id = ?';
        const sqlParams = [actualUserId];

        // 关键词搜索（匹配标题、描述、分类）
        if (keyword.trim()) {
            sql += ' AND (title LIKE ? OR `desc` LIKE ? OR lx LIKE ?)';
            const likeStr = `%${keyword.trim()}%`;
            sqlParams.push(likeStr, likeStr, likeStr);
        }

        // 排序 + 分页（LIMIT 偏移量, 每页条数）
        sql += ' ORDER BY created_at DESC LIMIT ?, ?';
        sqlParams.push(offsetNum, limitNum);
        
        // 执行查询
        const [results] = await poolBiliVideo.query(sql, sqlParams);
        res.json({
            data: results,
            pagination: {
                page: pageNum,       // 当前页码
                pageSize: limitNum,  // 每页条数
                total: results.length // 当前页实际返回条数（如需总条数需额外查询）
            }
        });
    } catch (error) {
        console.error('Query error:', error);
        res.status(500).json({ error: '查询数据库失败' });
    }
});

// 获取所有抖音视频数据
app.get('/api/4c/video/douyin', verifyToken, async (req, res) => {
    try {
        const username = req.user.username;
        // 解析参数，设置默认值
        const {
            num = 10,       // 每页条数
            page = 1,       // 页码（默认第一页）
            keyword = ''    // 搜索关键词
        } = req.query;

        const actualUserId = username;

        // 边界处理：每页条数限制 1-100，页码限制 ≥1
        const parsedNum = parseInt(num, 10);
        const parsedPage = parseInt(page, 10);
        const limitNum = Math.max(1, Math.min(100, isNaN(parsedNum) ? 10 : parsedNum));
        const pageNum = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
        // 计算偏移量（跳过前面多少条数据）
        const offsetNum = (pageNum - 1) * limitNum;

        // 构建 SQL 语句和参数
        let sql = 'SELECT * FROM video_douyin_data WHERE user_id = ?';
        const sqlParams = [actualUserId];

        // 关键词搜索（匹配标题、描述、分类）
        if (keyword.trim()) {
            sql += ' AND (title LIKE ? OR `desc` LIKE ? OR lx LIKE ?)';
            const likeStr = `%${keyword.trim()}%`;
            sqlParams.push(likeStr, likeStr, likeStr);
        }

        // 排序 + 分页（LIMIT 偏移量, 每页条数）
        sql += ' ORDER BY created_at DESC LIMIT ?, ?';
        sqlParams.push(offsetNum, limitNum);
        
        // Debug logging
        console.log('Executing SQL:', sql);
        console.log('SQL Params:', sqlParams);
        console.log('Param types:', typeof sqlParams[0], typeof sqlParams[1], typeof sqlParams[2]);

        // 执行查询（使用async/await处理Promise，使用query方法更适合动态参数）
        const [results] = await poolDouyinVideo.query(sql, sqlParams);
        res.json({
            data: results,
            pagination: {
                page: pageNum,       // 当前页码
                pageSize: limitNum,  // 每页条数
                total: results.length // 当前页实际返回条数（如需总条数需额外查询）
            }
        });
    } catch (err) {
        console.error('Query error:', err);
        res.status(500).json({ error: '查询数据库失败', details: err.message });
    }
});

// 获取所有快手视频数据
app.get('/api/4c/video/kuaishou', verifyToken, async (req, res) => {
    try {
        const username = req.user.username;
        // 解析参数，设置默认值
        const {
            num = 10,       // 每页条数
            page = 1,       // 页码（默认第一页）
            keyword = ''    // 搜索关键词
        } = req.query;

        const actualUserId = username;

        // 边界处理：每页条数限制 1-100，页码限制 ≥1
        const limitNum = Math.max(1, Math.min(100, parseInt(num, 10) || 10));
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        // 计算偏移量（跳过前面多少条数据）
        const offsetNum = (pageNum - 1) * limitNum;

        // 构建 SQL 语句和参数
        let sql = 'SELECT * FROM video_kuaishou_data WHERE user_id = ?';
        const sqlParams = [actualUserId];

        // 关键词搜索（匹配标题、描述、分类）
        if (keyword.trim()) {
            sql += ' AND (title LIKE ? OR owner_name LIKE ?)';
            const likeStr = `%${keyword.trim()}%`;
            sqlParams.push(likeStr, likeStr);
        }

        // 排序 + 分页（LIMIT 偏移量, 每页条数）
        sql += ' ORDER BY created_at DESC LIMIT ?, ?';
        sqlParams.push(offsetNum, limitNum);

        // 执行查询（使用async/await处理Promise）
        const [results] = await poolDouyinVideo.query(sql, sqlParams);
        res.json({
            data: results,
            pagination: {
                page: pageNum,       // 当前页码
                pageSize: limitNum,  // 每页条数
                total: results.length // 当前页实际返回条数（如需总条数需额外查询）
            }
        });
    } catch (err) {
        console.error('Query error:', err);
        res.status(500).json({ error: '查询数据库失败', details: err.message });
    }
});
// 1. 添加 Cookie 到数据库（供 cookiepost.js 调用）
app.post('/api/cookie/add', async (req, res) => {
    try {
        const { cookie_content, create_time, expire_time } = req.body;
        if (!cookie_content || !create_time || !expire_time) {
            return res.status(400).json({ error: '缺少 cookie_content、create_time 或 expire_time' });
        }

        // 插入新 Cookie（默认有效）
        const [result] = await poolCookie.execute(`
            INSERT INTO cookie_pool (cookie_content, create_time, expire_time, is_valid)
            VALUES (?, ?, ?, 1)
        `, [cookie_content, create_time, expire_time]);

        res.status(200).json({
            message: 'Cookie 添加成功',
            id: result.insertId
        });
    } catch (error) {
        res.status(500).json({ error: '添加 Cookie 失败', details: error.message });
    }
});

app.get('/api/cookie/get-valid', async (req, res) => {
    try {
        console.log('尝试获取有效Cookie');
        // 优先选择未过期、有效且最近最少使用的Cookie
        const [rows] = await poolCookie.execute(`
            SELECT cookie_content FROM cookie_pool
            WHERE is_valid = 1 AND expire_time > NOW()
            ORDER BY last_used_time ASC
            LIMIT 1
        `);

        console.log('查询返回值:', rows);

        if (rows.length === 0) {
            console.log('没有找到有效Cookie');
            return res.status(404).json({ error: '无有效Cookie' });
        }

        const cookie = rows[0].cookie_content;
        console.log('找到有效Cookie:', cookie);

        // 更新最后使用时间
        await poolCookie.execute(`
            UPDATE cookie_pool
            SET last_used_time = NOW()
            WHERE cookie_content = ?
        `, [cookie]);
        
        res.status(200).json({ cookie });
    } catch (error) {
        console.error('获取Cookie时出错:', error);
        res.status(500).json({ error: '获取有效Cookie失败', details: error.message });
    }
});
// 3. 标记 Cookie 为无效（供 bili.js 调用）
app.post('/api/cookie/invalidate', async (req, res) => {
    try {
        const { cookie_content } = req.body;
        if (!cookie_content) {
            return res.status(400).json({ error: '缺少 cookie_content' });
        }

        await poolCookie.execute(`
            UPDATE cookie_pool
            SET is_valid = 0
            WHERE cookie_content = ?
        `, [cookie_content]);

        res.status(200).json({ message: 'Cookie 已标记为无效' });
    } catch (error) {
        res.status(500).json({ error: '标记 Cookie 失败', details: error.message });
    }
});


// 用户设置相关接口

// 保存用户设置
app.post('/api/user/settings', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.username;
        const { settings } = req.body;
        
        if (!settings) {
            return res.status(400).json({ error: '缺少settings参数' });
        }
        
        // 插入或更新用户设置
        const [rows] = await pool.execute(`
            INSERT INTO user_settings (user_id, settings, updated_at)
            VALUES (?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                settings = VALUES(settings),
                updated_at = NOW()
        `, [user_id, JSON.stringify(settings)]);
        
        res.status(200).json({ message: '设置保存成功' });
    } catch (error) {
        console.error('保存用户设置失败:', error);
        res.status(500).json({ error: '保存设置失败', details: error.message });
    }
});

// 获取用户设置
app.get('/api/user/settings', verifyToken, async (req, res) => {
    try {
        const user_id = req.user.username;
        
        const [rows] = await pool.execute(`
            SELECT settings FROM user_settings WHERE user_id = ?
        `, [user_id]);
        
        if (rows.length > 0) {
            res.status(200).json({ settings: JSON.parse(rows[0].settings) });
        } else {
            res.status(200).json({ settings: {} });
        }
    } catch (error) {
        console.error('获取用户设置失败:', error);
        res.status(500).json({ error: '获取设置失败', details: error.message });
    }
});

// 404处理
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'An unexpected error occurred' });
});

const port = 7010;
http.createServer(app).listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});