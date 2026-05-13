const express = require('express'); 
const app = express();
const fs = require('fs');
const http = require('http');
const https = require('https');
const cors = require('cors');
const md5 = require('md5');
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

async function getValidCookieFromDB() {
    try {
        const response = await fetch('https://api.yutangxiaowu.cn/api/cookie/get-valid', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`获取有效 Cookie 失败: ${response.status}`);
        }
        const data = await response.json();
        if (!data.cookie) {
            throw new Error('数据库中无有效 Cookie');
        }
        return data.cookie; // 返回从数据库获取的 Cookie
    } catch (error) {
        console.error('从数据库获取 Cookie 出错:', error);
        throw error; // 抛出错误，让调用方处理
    }
}

// 每次请求前获取最新Cookie
async function getCurrentCookie() {
    try {
        // 优先从数据库获取最新Cookie
        const dbCookie = await getValidCookieFromDB();
        const cookie = dbCookie || process.env.BILI_COOKIE;

        if (!cookie) {
            throw new Error('数据库和环境变量中均未配置有效Cookie');
        }
        return cookie;
    } catch (error) {
        console.error('获取当前Cookie失败:', error);
        throw error;
    }
}

// WBI签名相关配置，参考开源社区Github项目
// WBI混合密钥表映射表
const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
];

// 生成WBI混合密钥，剪切前32位
const getMixinKey = (orig) => mixinKeyEncTab.map(n => orig[n]).join('').slice(0, 32);

// 对参数进行WBI签名
function encWbi(params, img_key, sub_key) {
    const mixin_key = getMixinKey(img_key + sub_key),  //生成混合密钥
        curr_time = Math.round(Date.now() / 1000),     //获取秒级时间戳
        chr_filter = /[!'()*]/g;                       //特殊字符过滤正则
    Object.assign(params, { wts: curr_time });         //添加时间戳参数
    const query = Object                               //对参数进行排序和编码
        .keys(params)                                  //获取参数键名
        .sort()                                        //排序键名
        .map(key => {                                  //映射每个键值对
            const value = params[key].toString().replace(chr_filter, '');        //过滤特殊字符
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;    //编码键值对
        })
        .join('&');                                 //连接成查询字符串
    const wbi_sign = md5(query + mixin_key);        //生成签名
    return query + '&w_rid=' + wbi_sign;            //返回带签名的查询字符串
}

// 获取WBI密钥
async function getWbiKeys() {
    try {
        // 每次获取WBI密钥时都获取最新Cookie
        const cookie = await getCurrentCookie();
        const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
            method: "GET",  // GET请求
            // 请求头，包含最新Cookie和User-Agent
            headers: {
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Referer": "https://www.bilibili.com/"
            }
        });
        if (!res.ok) {
            throw new Error(`获取WBI密钥失败: ${res.status}（${res.statusText}）`);     //抛出错误，包含状态码和状态文本
        }
        const data = await res.json();
        if (!data?.data?.wbi_img?.img_url || !data?.data?.wbi_img?.sub_url) {         //检查必要字段
            throw new Error("B站返回数据异常，无法提取 img_key / sub_key");
        }
        const { wbi_img: { img_url, sub_url } } = data.data;
        return {
            //切割https链接，获取文件名作为key
            img_key: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
            sub_key: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'))
        };
    } catch (error) {
        console.error("获取WBI密钥出错:", error);
        throw error;
    }
}

// 初始化函数（不再初始化Cookie，改为每次请求动态获取）
async function init() {
    console.log('服务初始化完成，将在每次请求时动态获取Cookie');
}

const port2 = 7005;

// 初始化完成后再启动服务
init().then(() => {
    // 所有依赖Cookie的接口和服务逻辑，必须在此时之后执行
    http.createServer(app).listen(port2, () => {
        console.log(`本地服务已启动，端口：${port2}`);
    });
});

// 根据bvid获取cid的函数
async function getCidByBvid(bvid) {
    try {
        // 每次请求都获取最新Cookie
        const cookie = await getCurrentCookie();
        const targetApi = `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`;
        // 发送GET请求获取CID
        const response = await fetch(targetApi, {
            method: "GET",  // GET请求
            // 请求头，包含最新Cookie和User-Agent
            headers: {
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error(`请求CID失败: ${response.status}（${response.statusText}）`);
        }
        const data = await response.json();      // 解析JSON响应
        if (data.code !== 0 || !data.data || data.data.length === 0) {         //检查返回数据是否有效
            throw new Error(`获取CID失败: ${data.message || '未返回有效数据'}`);
        }
        return data.data[0].cid;
    } catch (error) {
        console.error("获取CID出错:", error);
        throw error;
    }
}

// 根据bvid获取avid
async function getAidByBvid(bvid) {
    try {
        const response = await fetch(`http://localhost:${port}/api/4c/bili/bilivideo?bvid=${bvid}`);
        if (!response.ok) {
            throw new Error(`请求avid失败: ${response.status}（${response.statusText}）`);
        }
        const data = await response.json();      // 解析JSON响应
        if (data.code !== 0 || !data.data) {         //检查返回数据是否有效
            throw new Error(`获取avid失败: ${data.message || '未返回有效数据'}`);
        }
        console.log("获取avid成功，avid:", data.data.aid);
        return data.data.aid;
    } catch (error) {
        console.error("获取avid出错:", error);
        throw error;
    }
}

// 从URL中提取bvid的函数
function extractBvidFromUrl(url) {
    const bvidPattern = /BV[0-9A-Za-z]{10,12}/;   // 匹配bvid的正则表达式
    const match = url.match(bvidPattern);         // 提取匹配的bvid
    return match ? match[0] : null;
}

// 处理b23.tv短链接重定向获取web地址
async function getRedirectedUrl(shortUrl) {
    try {
        const response = await fetch(shortUrl, { method: 'HEAD', redirect: 'manual' });    // 只获取头部信息，禁止自动重定向
        if (response.status >= 300 && response.status < 400 && response.headers.has('Location')) {
            return response.headers.get('Location');
        }
        return shortUrl;
    } catch (error) {
        console.error('获取重定向链接失败:', error);
        return null;
    }
}


// 从短链接获取bvid
async function getBvidFromShortUrl(shortUrl) {
    let bvid = extractBvidFromUrl(shortUrl);     // 尝试直接提取bvid
    if (bvid) {
        return bvid;
    }
    const fullUrl = await getRedirectedUrl(shortUrl);    // 获取重定向后的完整URL
    if (!fullUrl) {
        return null;
    }
    return extractBvidFromUrl(fullUrl);
}

// 主函数：根据URL获取bvid
async function getBvid(url) {
    let bvid = extractBvidFromUrl(url);
    if (bvid) {
        return bvid;
    }
    if (url.includes('b23.tv')) {      //处理b23.tv短链接
        return getBvidFromShortUrl(url);    //获取bvid
    }
    return null;
}

// 视频基础信息接口
app.get('/api/4c/bili/bilivideo', async (req, res) => {
    try {
        const { bvid } = req.query;
        if (!bvid) {
            return res.status(400).json({
                error: "缺少 bvid 参数"
            });
        }

        // 获取最新Cookie
        const cookie = await getCurrentCookie();
        // 构建WBI签名URL
        const targetApi = "https://api.bilibili.com/x/web-interface/wbi/view";
        const webKeys = await getWbiKeys();
        const queryString = encWbi({ bvid }, webKeys.img_key, webKeys.sub_key);
        // 发送GET请求获取视频信息
        const response = await fetch(`${targetApi}?${queryString}`, {
            method: "GET",
            headers: {
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error(`请求视频信息失败: ${response.status}（${response.statusText}）`);
        }
        const data = await response.json();
        console.log("请求成功，返回数据：", data);
        res.json(data);    // 返回获取到的数据
    } catch (error) {
        console.error("请求失败：", error);
        res.status(500).json({
            error: "获取数据失败",
            details: error.message
        });
    }
});

// CID查询接口
app.get('/api/4c/bili/bilicid', async (req, res) => {
    try {
        const { bvid } = req.query;
        if (!bvid) {
            return res.status(400).json({
                error: "缺少 bvid 参数"
            });
        }

        // 获取最新Cookie
        const cookie = await getCurrentCookie();
        // 构建请求URL
        const targetApi = `https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`;
        // 发送GET请求获取CID
        const response = await fetch(targetApi, {
            method: "GET",
            headers: {
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error(`请求视频信息失败: ${response.status}（${response.statusText}）`);
        }
        const data = await response.json();   // 解析JSON响应
        console.log("请求成功，返回数据：", data);
        res.json(data);
    } catch (error) {
        console.error("请求失败：", error);
        res.status(500).json({
            error: "获取数据失败",
            details: error.message
        });
    }
});

// 视频播放地址接口
app.get('/api/4c/bili/bilivideobf', async (req, res) => {
    try {
        const { bvid } = req.query;
        if (!bvid) {
            return res.status(400).json({
                error: "缺少 bvid 参数"
            });
        }
        const cid = await getCidByBvid(bvid);
        // 获取最新Cookie
        const cookie = await getCurrentCookie();
        // 构建请求参数
        const platform = 'html5';   //返回HTML5播放地址
        const fourk = 1;     // 是否返回4K视频地址
        const fnver = 0;
        const qn = 80;        // 清晰度，80表示1080P
        const high_quality = 1;  // 是否请求高质量视频
        const webKeys = await getWbiKeys();  // 获取WBI签名密钥
        const params = {
            bvid,
            cid,
            platform,
            high_quality,
            fourk,
            fnver,
            qn
        };
        // 构建WBI签名查询字符串
        const queryString = encWbi(params, webKeys.img_key, webKeys.sub_key);
        // 发送GET请求获取视频播放地址
        const targetApi = `https://api.bilibili.com/x/player/wbi/playurl?${queryString}`;
        const response = await fetch(targetApi, {
            method: "GET",
            headers: {
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
        });
        if (!response.ok) {
            throw new Error(`请求视频信息失败: ${response.status}（${response.statusText}）`);
        }
        const data = await response.json();
        console.log("请求成功，返回数据：", data);
        res.json(data);
    } catch (error) {
        console.error("请求失败：", error);
        res.status(500).json({
            error: "获取数据失败",
            details: error.message
        });
    }
});

// 合并视频数据接口
app.get('/api/4c/bili/combinedVideo', verifyToken, async (req, res) => {
    try {
        const username = req.user.username; // 从 Token 中获取用户名
        let { bvid, url } = req.query;
        // 覆盖查询参数中的username，使用Token身份
        const user_id = username;

        if (!bvid && url) {
            bvid = await getBvid(url);
        }
        if (!bvid) {
            return res.status(400).json({ error: "无有效bvid参数" });
        }

        // 非阻塞式日志记录，不影响主流程
        axios.post('https://api.yutangxiaowu.cn/api/log-call', {
            user_id: user_id,
            api_endpoint: '/api/4c/bili/bilivideo'
        }, {
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        }).catch(error => {
            console.error(`日志记录失败 - 用户: ${user_id}, BV号: ${bvid}, 错误:`, error.message);
        });

        // 调用本地接口获取数据
        const [data1, data2] = await Promise.all([
            fetch(`https://api.yutangxiaowu.cn/api/4c/bili/bilivideobf?bvid=${bvid}`).then(r => r.json()),   // 获取播放地址信息
            fetch(`https://api.yutangxiaowu.cn/api/4c/bili/bilivideo?bvid=${bvid}`).then(r => r.json())      // 获取基础视频信息
        ]);

        // 合并数据并返回
        const combinedData = {
            basicInfo: data1,   // 视频基础信息
            playInfo: data2,   // 播放地址信息
            bvid: bvid,   // BV号
            timestamp: Date.now()
        };

        const pages = combinedData.playInfo.data.pages || [];
        const time = pages.length > 0 ? pages[0].ctime : null;   // 获取创建时间戳, 数组中第一个值

        /**
         * 时间戳转换为指定格式的日期字符串
         * @param {number} timestamp - 时间戳（秒级，如1759888975）
         * @param {string} format - 日期格式（默认'YYYY-MM-DD'）
         * @returns {string} 格式化后的日期字符串
         */

        function timestampToDate(timestamp, format = 'YYYY-MM-DD') {
            // 时间戳若为秒级，需转换为毫秒级（JS中Date使用毫秒）
            const date = new Date(timestamp * 1000);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，补0
            const day = String(date.getDate()).padStart(2, '0'); // 日期补0

            // 替换格式字符串中的占位符
            return format
                .replace('YYYY', year)
                .replace('MM', month)
                .replace('DD', day);
        }

        const formattedDate = timestampToDate(time, 'YYYY-MM-DD');    // 格式化创建时间

        // 提取特定字段并做映射处理,构建简洁返回数据
        const mappedData = {
            code: combinedData.basicInfo.code,                // 状态码
            msg: '数据获取成功',        // 成功消息-水印
            data: {
                bvid: combinedData.playInfo.data.bvid,        // BV号
                aid: combinedData.playInfo.data.stat.aid,     // AV号
                cid: combinedData.playInfo.data.cid,          // CID号
                video: {
                    title: combinedData.playInfo.data.title,  // 视频标题
                    fm: combinedData.playInfo.data.pic,       // 封面图片
                    lx: combinedData.playInfo.data.tname,     // 类型
                    desc: combinedData.playInfo.data.desc,    // 描述
                    max_qxd: combinedData.basicInfo.data.support_formats[0].new_description,   // 最高清晰度描述
                    url: combinedData.basicInfo.data.durl[0].url  // 播放地址
                },
                owner: {
                    name: combinedData.playInfo.data.owner.name,  // UP主名称
                    mid: combinedData.playInfo.data.owner.mid,    // UP主UID
                    face: combinedData.playInfo.data.owner.face   // UP主头像
                },
                stat: {
                    view: combinedData.playInfo.data.stat.view,           // 播放数
                    danmaku: combinedData.playInfo.data.stat.danmaku,     // 弹幕数
                    reply: combinedData.playInfo.data.stat.reply,         // 回复数
                    favorite: combinedData.playInfo.data.stat.favorite,   // 收藏数
                    coin: combinedData.playInfo.data.stat.coin,           // 硬币数
                    share: combinedData.playInfo.data.stat.share,         // 分享数
                    like: combinedData.playInfo.data.stat.like,           // 点赞数
                    ctime: combinedData.playInfo.data.pages.ctime,        // 创建时间戳
                    time: formattedDate,                                  // 格式化创建日期
                },
                type: 'video'
            }
        };

        // 自动保存数据到数据库 (包含user_id)
        try {
            await axios.post('https://api.yutangxiaowu.cn/api/bili/video', {
                data: mappedData.data
            }, {
                headers: {
                    'Authorization': req.headers.authorization // 转发Token给sql.js
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false
                })
            });
            console.log('数据自动保存成功 - 用户:', user_id);
        } catch (error) {
            console.error('数据自动保存失败:', error.message);
        }

        res.json(mappedData);
    } catch (error) {
        console.error('Combined video data error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/4c/bili/bilisearch', async (req, res) => {
    const { num = 20, search_type = 'video', page = 1, keyword, order = 'totalrank', duration = 0 } = req.query;
    if (!keyword) {
        return res.status(400).json({ error: "缺少必要参数" });
    }

    // 转换为数字类型并设置合理范围
    const targetNum = Math.min(parseInt(num, 10) || 20, 100); // 限制最大获取数量
    const startPage = parseInt(page, 10) || 1;

    // 存储所有BV号和数据的数组
    const allBvidList = [];
    const allPageData = [];
    let currentPage = startPage;

    if (search_type === 'video') {
        try {
            // 循环直到获取足够数量的数据或没有更多数据
            while (allBvidList.length < targetNum) {
                const cookie = await getCurrentCookie();
                const webKeys = await getWbiKeys();

                const params = {
                    search_type,
                    order,    // 排序方式
                    duration, // 视频时长筛选
                    page: currentPage,
                    keyword,
                };

                const queryString = encWbi(params, webKeys.img_key, webKeys.sub_key);
                const targetApi = `https://api.bilibili.com/x/web-interface/wbi/search/type?${queryString}`;

                const response = await fetch(targetApi, {
                    method: "GET",
                    headers: {
                        "Cookie": cookie,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                        "Accept": "application/json"
                    }
                });

                if (!response.ok) {
                    throw new Error(`请求视频信息失败: ${response.status}（${response.statusText}）`);
                }

                const data = await response.json();
                const currentPageResults = data.data?.result || [];

                // 如果当前页没有数据，说明已到最后一页，终止循环
                if (currentPageResults.length === 0) {
                    break;
                }

                // 提取当前页的BV号
                const bvidList = currentPageResults.map(item => item.bvid);
                console.log(`第${currentPage}页BV号列表：`, bvidList);

                const needNum = targetNum - allBvidList.length;
                const addBvids = needNum < bvidList.length ? bvidList.slice(0, needNum) : bvidList;
                const addResults = needNum < currentPageResults.length ? currentPageResults.slice(0, needNum) : currentPageResults;

                // 添加到总列表
                allBvidList.push(...addBvids);
                allPageData.push({
                    page: currentPage,
                    data: data,
                    usedResults: addResults.length
                });

                // 如果已获取足够数据，终止循环
                if (allBvidList.length >= targetNum) {
                    break;
                }

                currentPage++;
                // 可选：添加请求间隔，避免请求过快被限制
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 返回结果
            res.json({
                code: 0,
                msg: '获取BV号列表成功',
                requestNum: targetNum,
                actualNum: allBvidList.length,
                bvidList: allBvidList,
                pageData: allPageData
            });

        } catch (error) {
            console.error("请求失败：", error);
            res.status(500).json({
                error: "获取数据失败",
                details: error.message,
                partialBvidList: allBvidList // 返回已获取的部分数据
            });
        }
    } else {
        res.status(400).json({
            error: "暂不支持非视频类型的搜索"
        });
    }
});

app.get('/api/4c/bili/comment/all', async (req, res) => {
    // 解构查询参数，增加默认值和类型转换
    const {
        oid,
        bvid,
        type = 1,
        mode = 1,
        totalPages = 2,  // 要获取的总页数
    } = req.query;

    // 参数校验
    if (!oid && !bvid) {
        return res.status(400).json({ code: -1, message: '缺少oid或bvid参数' });
    }
    if (totalPages < 1 || isNaN(Number(totalPages))) {
        return res.status(400).json({ code: -1, message: 'totalPages必须为正整数' });
    }

    try {
        // 1. 处理AV号（如果提供bvid则转换为aid）
        let aid = oid;
        if (bvid) {
            aid = await getAidByBvid(bvid); // 确保该函数返回有效aid
            if (!aid) {
                return res.status(404).json({ code: -1, message: '通过bvid未找到对应的aid' });
            }
        }

        const allMessages = []; // 仅存储message字段
        let currentPage = 1;
        let nextOffsetStr = ''; // 存储下一页的offset字符串（嵌套参数核心）

        // 2. 循环获取指定页数的评论
        while (currentPage <= totalPages) {
            // 获取最新Cookie和Wbi密钥（建议缓存，避免频繁请求）
            const cookie = await getCurrentCookie();
            const webKeys = await getWbiKeys();

            // 3. 构建基础参数
            const baseParams = {
                type: Number(type),
                oid: Number(aid),
                mode: Number(mode),
                plat: 1, // Web平台
                web_location: 1315875,
                wts: Math.floor(Date.now() / 1000), // 时间戳（秒）
            };

            // 4. 处理嵌套参数pagination_str（分页核心）
            let params = { ...baseParams };
            if (currentPage > 1 && nextOffsetStr) {
                // 分页时添加嵌套参数：pagination_str是包含offset的JSON字符串
                params.pagination_str = JSON.stringify({
                    offset: nextOffsetStr // offset是上一页返回的next_offset
                });
            }

            // 5. 生成Wbi签名（确保encWbi函数正确处理嵌套JSON参数）
            const queryString = encWbi(params, webKeys.img_key, webKeys.sub_key);
            const commentUrl = `https://api.bilibili.com/x/v2/reply/wbi/main?${queryString}`;

            // 6. 发送请求
            const commentResponse = await fetch(commentUrl, {
                method: "GET",
                headers: {
                    "Cookie": cookie,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
                    "Referer": "https://www.bilibili.com/"
                }
            });

            // 7. 处理响应
            if (!commentResponse.ok) {
                throw new Error(`请求失败，状态码：${commentResponse.status}`);
            }
            const commentData = await commentResponse.json();
            if (commentData.code !== 0) {
                throw new Error(`接口返回错误：${commentData.message}（code: ${commentData.code}）`);
            }

            // 8. 仅提取comment中的message字段，忽略其他数据
            const replies = commentData.data?.replies || [];
            const pageMessages = replies.map(reply => reply.content?.message || ''); // 兼容无message的情况
            allMessages.push(...pageMessages);

            // 9. 获取下一页的offset（关键：从响应中提取next_offset）
            nextOffsetStr = commentData.data?.cursor?.pagination_reply?.next_offset || '';
            if (!nextOffsetStr && currentPage < totalPages) {
                console.warn(`第${currentPage + 1}页无更多数据，提前终止`);
                break; // 没有更多数据时终止循环
            }

            currentPage++;
            // 避免请求过于频繁，添加延迟
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 10. 返回结果：仅包含所有message字段
        res.json({
            code: 0,
            message: '获取评论区数据成功',
            next_offset: nextOffsetStr,
            data: {
                total: allMessages.length,
                comments: allMessages // 直接返回message数组
            }
        });

    } catch (err) {
        console.error('评论获取失败：', err);
        res.status(500).json({
            code: -1,
            message: '获取评论失败',
            error: err.message
        });
    }
});

const port = 7003;

// 启动服务
http.createServer(app).listen(port, () => {
    console.log(`后端服务已启动，端口：${port}`);
    console.log(`接口地址：http://localhost:${port}/api/4c/bili`);
    console.log(`视频播放接口：http://localhost:${port}/api/4c/bili/bilivideobf?bvid=xxx`);
});