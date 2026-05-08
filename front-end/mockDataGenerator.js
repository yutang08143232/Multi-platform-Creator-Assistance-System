/**
 * 模拟数据生成与合规数据接入工具
 * 提供演示用的模拟数据生成功能和文件导入数据清洗功能
 */
class MockDataGenerator {
    constructor() {
        this.authors = [
            "科技前沿观察", "美食探店小分队", "二次元集中营", "硬核知识科普", 
            "生活小妙招", "游戏实况主", "萌宠日记", "数码评测室", 
            "历史冷知识", "影视解说王"
        ];
        
        this.titles = [
            "【深度解析】为什么现在的年轻人都不爱看电视了？",
            "挑战100元吃遍全城美食，结果令人意外！",
            "耗时300小时制作，还原《原神》璃月港全景",
            "iPhone 16 Pro Max 深度评测：这才是真正的机皇？",
            "3分钟学会这道家常菜，隔壁小孩都馋哭了",
            "猫咪的这5个行为，其实是在向你表达爱意",
            "《黑神话：悟空》实机演示分析，国产之光稳了？",
            "揭秘古代皇帝的真实生活，和电视剧里完全不一样",
            "2025年最值得入手的5款数码产品推荐",
            "从零开始学编程，新手必看的入门指南"
        ];
    }

    /**
     * 生成模拟数据
     * @param {number} count 生成数量
     * @returns {Array} 模拟视频数据数组
     */
    generateMockData(count = 10) {
        const results = [];
        const platforms = ['bilibili', 'douyin', 'kuaishou', 'xiaohongshu'];
        
        for (let i = 0; i < count; i++) {
            const platform = platforms[Math.floor(Math.random() * platforms.length)];
            const baseStat = Math.floor(Math.random() * 100000) + 5000;
            const publishTime = Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000);
            
            const video = {
                title: this.titles[Math.floor(Math.random() * this.titles.length)] + ` [模拟${i+1}]`,
                author: this.authors[Math.floor(Math.random() * this.authors.length)],
                platform: platform,
                pic: 'https://item.cn-nb1.rains3.com/d6d5d796-fb67-4625-b831-ef90f3447af3.png', // 示例封面
                created_at: new Date(publishTime).toISOString()
            };

            // 根据平台特征生成差异化数据
            if (platform === 'bilibili') {
                // B站：高收藏、高弹幕
                video.bvid = 'BV' + Math.random().toString(36).substring(2, 12).toUpperCase();
                video.url = `https://www.bilibili.com/video/${video.bvid}`;
                video.stat = {
                    view: baseStat * (Math.random() * 5 + 1),
                    danmaku: Math.floor(baseStat * 0.15),
                    reply: Math.floor(baseStat * 0.05),
                    favorite: Math.floor(baseStat * 0.4), // 高收藏
                    coin: Math.floor(baseStat * 0.3),
                    share: Math.floor(baseStat * 0.1),
                    like: Math.floor(baseStat * 0.5)
                };
                video.create_time = publishTime; // B站使用毫秒级时间戳
            } else if (platform === 'douyin') {
                // 抖音：高点赞、高推荐
                video.vid = Math.random().toString().substring(2, 20);
                video.url = `https://www.douyin.com/video/${video.vid}`;
                video.stat = {
                    like: Math.floor(baseStat * 1.5), // 高点赞
                    reply: Math.floor(baseStat * 0.1),
                    favorite: Math.floor(baseStat * 0.2),
                    recommend: Math.floor(baseStat * 0.8), // 高推荐
                    share: Math.floor(baseStat * 0.3),
                    time: Math.floor(publishTime / 1000) // 抖音使用秒级时间戳
                };
            } else if (platform === 'kuaishou') {
                // 快手：高播放、高评论
                video.vid = Math.random().toString().substring(2, 15);
                video.url = `https://www.kuaishou.com/short-video/${video.vid}`;
                video.stat = {
                    view: baseStat * (Math.random() * 8 + 2), // 高播放
                    like: Math.floor(baseStat * 0.6),
                    comment: Math.floor(baseStat * 0.2), // 高评论
                    share: Math.floor(baseStat * 0.15)
                };
                video.create_time = publishTime; // 快手使用毫秒级时间戳
            } else if (platform === 'xiaohongshu') {
                // 小红书：高收藏、高评论
                video.vid = Math.random().toString().substring(2, 18);
                video.url = `https://www.xiaohongshu.com/explore/${video.vid}`;
                video.stat = {
                    view: baseStat * (Math.random() * 3 + 1),
                    like: Math.floor(baseStat * 0.8),
                    comment: Math.floor(baseStat * 0.3), // 高评论
                    favorite: Math.floor(baseStat * 0.5), // 高收藏
                    share: Math.floor(baseStat * 0.2)
                };
                video.create_time = publishTime; // 小红书使用毫秒级时间戳
            }
            
            results.push(video);
        }
        
        console.log(`已生成 ${count} 条模拟数据`);
        return results;
    }

    /**
     * 清洗导入的数据
     * @param {Array} data 导入的原始数据
     * @returns {Object} { validData: Array, errors: Array }
     */
    cleanImportData(data) {
        if (!Array.isArray(data)) {
            return { validData: [], errors: ['导入数据格式错误：必须为数组'] };
        }

        const validData = [];
        const errors = [];

        data.forEach((item, index) => {
            // 0. 兼容中文表头 (Excel导入)
            if (!item.title && item['视频标题']) item.title = item['视频标题'];
            if (!item.url && item['视频链接']) item.url = item['视频链接'];
            if (!item.bvid && item['BV号']) item.bvid = item['BV号'];
            if (!item.vid && item['视频ID']) item.vid = item['视频ID'];
            if (!item.author && item['作者']) item.author = item['作者'];
            if (!item.pic && item['封面']) item.pic = item['封面'];
            
            // 映射统计数据
            if (item['播放量'] !== undefined) item.view = item['播放量'];
            if (item['弹幕数'] !== undefined) item.danmaku = item['弹幕数'];
            if (item['评论数'] !== undefined) item.reply = item['评论数'];
            if (item['收藏数'] !== undefined) item.favorite = item['收藏数'];
            if (item['硬币数'] !== undefined) item.coin = item['硬币数'];
            if (item['分享数'] !== undefined) item.share = item['分享数'];
            if (item['点赞数'] !== undefined) item.like = item['点赞数'];
            if (item['推荐数'] !== undefined) item.recommend = item['推荐数'];

            // 1. 基础字段校验
            if (!item.title && !item.url && !item.bvid && !item.vid) {
                errors.push(`第 ${index + 1} 条数据缺失关键标识(title/url/id)，已跳过`);
                return;
            }

            // 2. 平台识别与修正
            let platform = item.platform;
            if (!platform) {
                if (item.bvid || (item.url && item.url.includes('bilibili'))) platform = 'bilibili';
                else if (item.url && item.url.includes('douyin')) platform = 'douyin';
                else if (item.url && item.url.includes('kuaishou')) platform = 'kuaishou';
                else platform = 'unknown'; // 默认或未知
            }

            // 3. 数据结构标准化
            const cleanedItem = {
                title: item.title || `导入视频 ${index + 1}`,
                author: item.author || '未知作者',
                platform: platform,
                url: item.url || '',
                pic: item.pic || 'https://item.cn-nb1.rains3.com/nofm.png',
                bvid: item.bvid || (platform === 'bilibili' ? item.id : undefined),
                vid: item.vid || (platform !== 'bilibili' ? item.id : undefined),
                stat: {}
            };

            // 4. 统计指标清洗（容错处理：缺失补0，非数字转数字）
            const safeParseInt = (val) => {
                const num = parseInt(val);
                return isNaN(num) ? 0 : num;
            };

            const rawStat = item.stat || item; // 兼容stat平铺在顶层的情况

            if (platform === 'bilibili') {
                cleanedItem.stat = {
                    view: safeParseInt(rawStat.view || rawStat.view_count),
                    danmaku: safeParseInt(rawStat.danmaku || rawStat.danmaku_count),
                    reply: safeParseInt(rawStat.reply || rawStat.reply_count || rawStat.comment),
                    favorite: safeParseInt(rawStat.favorite || rawStat.favorite_count),
                    coin: safeParseInt(rawStat.coin || rawStat.coin_count),
                    share: safeParseInt(rawStat.share || rawStat.share_count),
                    like: safeParseInt(rawStat.like || rawStat.like_count)
                };
            } else if (platform === 'douyin') {
                cleanedItem.stat = {
                    like: safeParseInt(rawStat.like || rawStat.like_count),
                    reply: safeParseInt(rawStat.reply || rawStat.reply_count || rawStat.comment),
                    favorite: safeParseInt(rawStat.favorite || rawStat.favorite_count),
                    recommend: safeParseInt(rawStat.recommend || rawStat.recommend_count),
                    share: safeParseInt(rawStat.share || rawStat.share_count)
                };
            } else if (platform === 'kuaishou') {
                cleanedItem.stat = {
                    view: safeParseInt(rawStat.view || rawStat.view_count),
                    like: safeParseInt(rawStat.like || rawStat.like_count),
                    comment: safeParseInt(rawStat.comment || rawStat.comment_count || rawStat.reply),
                    share: safeParseInt(rawStat.share || rawStat.share_count)
                };
            } else {
                // 未知平台，保留所有可能的通用字段
                cleanedItem.stat = {
                    view: safeParseInt(rawStat.view || rawStat.view_count),
                    like: safeParseInt(rawStat.like || rawStat.like_count),
                    comment: safeParseInt(rawStat.comment || rawStat.comment_count || rawStat.reply),
                    share: safeParseInt(rawStat.share || rawStat.share_count)
                };
            }

            validData.push(cleanedItem);
        });

        return { validData, errors };
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.MockDataGenerator = MockDataGenerator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MockDataGenerator;
}
