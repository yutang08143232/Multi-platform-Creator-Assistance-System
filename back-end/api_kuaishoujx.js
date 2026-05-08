const express = require('express');                          
const app = express();
const fs = require('fs');
const http = require('http');
const https = require('https');
const cors = require('cors');
const axios = require('axios');                          
const fetch = require('node-fetch');                            
const { decapsulate } = require('crypto');
const { type } = require('os');
const verifyToken = require('./authMiddleware');
require('dotenv').config({ path: './env.env' });               


app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'OPTIONS', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

function extractUrlFromMsg(msg) {
    if (!msg) return null;
    const match = msg.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:kuaishou\.com|chenzhongtech\.com)\/[A-Za-z0-9._?%&+\-=\/#]*/);
    return match ? match[0] : null;
}

function validateUrlDomain(url) {
    const validDomains = [
        'v.kuaishou.com',
        'www.kuaishou.com',
        'kuaishou.com',
        'm.chenzhongtech.com',
        'chenzhongtech.com'
    ];

    try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname;

        for (const domain of validDomains) {
            if (host === domain || host.endsWith('.kuaishou.com') || host.endsWith('.chenzhongtech.com')) {
                return true;
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

const userAgents = [
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function get(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1'
                },
                timeout: 15000,
                validateStatus: function (status) {
                    return status >= 200 && status < 300;
                },
                responseType: 'text'
            });
            return response.data;
        } catch (error) {
            console.warn(`Request failed (attempt ${i + 1}/${retries}): ${error.message}`);
            if (i === retries - 1) {
                return JSON.stringify({
                    code: -1,
                    msg: '请求异常: ' + (error.response ? `Status ${error.response.status}` : error.message)
                }, null, 4);
            }
            // 等待一小段时间后重试
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

function formatDuration(duration) {
    if (duration < 60) {
        return `${duration}秒`;
    }

    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    const milliseconds = duration % 1000;

    let output = '';

    if (minutes > 0) {
        output += `${minutes}分钟`;
    }

    if (seconds > 0 || minutes > 0) {
        output += `${seconds}秒`;
    }

    if (milliseconds > 0 || (seconds === 0 && minutes === 0)) {
        output += `${milliseconds}毫秒`;
    }

    return output;
}

async function getRedirectUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });
        if (response.status >= 300 && response.status < 400 && response.headers.location) {
            return response.headers.location;
        }
        return url;
    } catch (error) {
        return url;
    }
}

async function parseContent(url) {
    if (url.includes('www.kuaishou.com/f/')) {
        url = await getRedirectUrl(url);
    }

    const content = await get(url);
    
    // 如果 content 是 JSON 字符串（错误信息），正则匹配会失败，走下面的错误处理逻辑

    const titleMatch = content.match(/"caption":"([^"]+?)"/);
    const title = titleMatch ? titleMatch[1].trim() : "未知标题";

    const authorMatch = content.match(/"userName":"([^"]+?)"/);
    const author = authorMatch ? authorMatch[1].trim() : "未知作者";

    const timestampMatch = content.match(/"timestamp":(\d+)/);
    let createTime = "未知";
    if (timestampMatch) {
        const timestamp = parseInt(timestampMatch[1]);
        const date = new Date(timestamp);
        // 格式化日期 YYYY-MM-DD HH:mm:ss
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');
        createTime = `${year}-${month}-${day} ${hours}:${minutes}:${second}`;
    }

    const likeMatch = content.match(/"likeCount":(\d+)/);
    const likes = likeMatch ? likeMatch[1] : "未知";

    const coverUrlMatch = content.match(/"coverUrls":\[\{"cdn":"[^"]+","url":"([^"]+?)"/);
    // 这里的正则 `[^"]+?` 会匹配到转义序列。我们需要 decode。
    // 简单的 decode 方法是 JSON.parse(`"${str}"`)
    const unescapeStr = (str) => {
        try {
            return JSON.parse(`"${str}"`);
        } catch (e) {
            return str;
        }
    };

    const coverUrl = coverUrlMatch ? unescapeStr(coverUrlMatch[1]) : "未知封面";

    const videoUrlMatch = content.match(/"mainMvUrls":\[\{"cdn":"[^"]+","url":"([^"]+?)"/);
    const videoUrl = videoUrlMatch ? unescapeStr(videoUrlMatch[1]) : null;

    const commentCountMatch = content.match(/"commentCount":(\d+)/);
    const commentCount = commentCountMatch ? commentCountMatch[1] : "未知评论数";

    const shareCountMatch = content.match(/"shareCount":(\d+)/);
    const shareCount = shareCountMatch ? shareCountMatch[1] : "-";

    const viewCountMatch = content.match(/"viewCount":(\d+)/);
    const viewCount = viewCountMatch ? viewCountMatch[1] : "未知浏览量";

    const songNameMatch = content.match(/"soundTrack":\{"name":"([^"]+?)"/);
    const songName = songNameMatch ? unescapeStr(songNameMatch[1].trim()) : "未知音频名称";

    const audioUrlMatch = content.match(/"audioUrls":\[\{"cdn":"[^"]+","url":"([^"]+?)"/);
    const audioUrl = audioUrlMatch ? unescapeStr(audioUrlMatch[1].trim()) : "未知音频链接";

    const durationMatch = content.match(/"duration":(\d+)/);
    let durationFormatted = "未知时长";
    if (durationMatch) {
        const duration = parseInt(durationMatch[1]);
        durationFormatted = formatDuration(duration);
    }

    const listMatch = content.match(/"list":\[(.*?)\]/);
    let list = [];
    if (listMatch) {
        try {
            list = JSON.parse(`[${listMatch[1]}]`);
        } catch (e) {
            list = [];
        }
    }

    let images = [];
    let videoUrlResult = 0;

    if (videoUrl) {
        images = 0;
        videoUrlResult = videoUrl;
    } else {
        videoUrlResult = 0;
        if (list.length > 0) {
            images = list.map(imageUrl => "https://p1.a.yximgs.com" + imageUrl);
        }
    }

    if (!videoUrlResult && (!images || (Array.isArray(images) && images.length === 0))) {
        const errorResult = {
            code: -1,
            msg: '解析失败，请检查参数！'
        };
        return JSON.stringify(errorResult, null, 4);
    }

    // 尝试从URL中提取视频ID
    let vid = '';
    try {
        const vidMatch = url.match(/\/([a-zA-Z0-9]+)\/?(?:\?.*)?$/);
        vid = vidMatch ? vidMatch[1] : 'unknown';
    } catch (e) {
        vid = 'unknown';
    }

    const result = {
        code: 0,
        msg: '解析成功!',
        data: {
            vid: vid,
            video: {
                title: title,
                url: videoUrlResult,
                fm: coverUrl,
                duration: durationFormatted
            },
            owner: {
                name: author
            },
            stat: {
                view: viewCount,
                like: likes,
                comment: commentCount,
                share: shareCount
            },
            // 保留额外信息
            createTime: createTime,
            images: images,
            songName: songName,
            audioUrl: audioUrl
        }
    };

    return JSON.stringify(result, null, 4);
}

app.get('/api/kuaishou', verifyToken, async (req, res) => {
    return handleKuaishouRequest(req, res);
});

app.get('/api/4c/kuaishou', verifyToken, async (req, res) => {
    return handleKuaishouRequest(req, res);
});

async function handleKuaishouRequest(req, res) {
    const url = req.query.url;
    // 从 Token 中获取用户名
    const username = req.user.username;
    const token = req.headers.authorization;
    
    // 设置返回类型为 JSON
    res.setHeader('Content-Type', 'application/json');

    if (url) {
        if (validateUrlDomain(url)) {
            const resultStr = await parseContent(url);
            
            // 尝试将数据写入数据库
            try {
                const resultObj = JSON.parse(resultStr);
                if (resultObj.code === 0) {
                    const userId = username;
                    axios.post('https://api.yutangxiaowu.cn/api/kuaishou/video', {
                        user_id: userId, // 这里的user_id其实会被sql.js忽略，因为sql.js会从token取，但为了兼容性还是传一下
                        data: resultObj.data
                    }, {
                        headers: {
                            'Authorization': token
                        }
                    }).then(response => {
                        console.log(`快手数据写入成功 - 用户: ${userId}, VID: ${resultObj.data.vid}`);
                    }).catch(err => {
                        console.error('快手数据写入失败:', err.message);
                    });
                }
            } catch (e) {
                console.error('解析结果JSON失败或数据库写入触发异常:', e);
            }

            res.send(resultStr);
        } else {
            const errorResult = {
                code: -1,
                msg: '本接口仅适用于快手视频解析！'
            };
            res.send(JSON.stringify(errorResult, null, 4));
        }
    } else {
        const errorResult = {
            code: -1,
            msg: '请携带url参数传入！'
        };
        res.send(JSON.stringify(errorResult, null, 4));
    }
}

const port = 7004;

http.createServer(app).listen(port, () => {
    console.log(`后端服务已启动，端口：${port}`);
    console.log(`接口地址：http://localhost:${port}/api/kuaishou`);
});