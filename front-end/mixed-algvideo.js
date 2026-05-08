/**
 * 混合平台视频推荐工具
 * 用于根据不同平台视频的统计数据计算综合得分并推荐最佳视频
 */
class MixedVideoRecommender {
    /**
     * 初始化推荐器
     * @param {Object} options 配置参数
     * @param {Object} options.bilibiliWeights B站各指标权重配置
     * @param {Object} options.douyinWeights 抖音各指标权重配置
     * @param {Object} options.kuaishouWeights 快手各指标权重配置
     * @param {Object} options.xiaohongshuWeights 小红书各指标权重配置
     * @param {number} options.platformWeights 平台权重配置，默认：{bilibili: 0.25, douyin: 0.25, kuaishou: 0.25, xiaohongshu: 0.25}
     * @param {number} options.normalizationMethod 归一化方法 0:min-max 1:z-score，默认0
     */
    constructor(options = {}, videos = []) {
        // 使用现有推荐器
        this.bilibiliRecommender = new VideoBiliRecommender({
            weights: options.bilibiliWeights,
            normalizationMethod: options.normalizationMethod || 0,
            timeDecayHalfLife: options.timeDecayHalfLife
        });
        
        this.douyinRecommender = new VideoDouyinRecommender({
            weights: options.douyinWeights,
            normalizationMethod: options.normalizationMethod || 0,
            timeDecayHalfLife: options.timeDecayHalfLife
        });

        this.kuaishouRecommender = new VideoKuaishouRecommender({
            weights: options.kuaishouWeights,
            normalizationMethod: options.normalizationMethod || 0,
            timeDecayHalfLife: options.timeDecayHalfLife
        });

        this.xiaohongshuRecommender = new VideoXiaohongshuRecommender({
            weights: options.xiaohongshuWeights,
            normalizationMethod: options.normalizationMethod || 0,
            timeDecayHalfLife: options.timeDecayHalfLife
        });
        
        // 平台权重，控制各平台在最终推荐中的占比
        // 如果传入了视频数据，则自动计算权重
        if (videos && videos.length > 0) {
            this.platformWeights = this.calculatePlatformWeights(videos);
        } else {
            this.platformWeights = options.platformWeights || {
                bilibili: 0.25,
                douyin: 0.25,
                kuaishou: 0.25,
                xiaohongshu: 0.25
            };
        }
        
        // 保存时间衰减半衰期用于报告显示
        this.timeDecayHalfLife = options.timeDecayHalfLife || 365;
    }

    /**
     * 计算平台权重
     * 根据传入的所有视频数据，自动量化推导B站、抖音、快手、小红书的平台因子
     * @param {Array} videos 所有混合平台视频数据数组
     * @returns {Object} {bilibili: 0.xx, douyin: 0.xx, kuaishou: 0.xx, xiaohongshu: 0.xx}
     */
    calculatePlatformWeights(videos) {
        if (!videos || videos.length === 0) {
            return { bilibili: 0.25, douyin: 0.25, kuaishou: 0.25, xiaohongshu: 0.25 };
        }

        // 1. 视频归类（临时处理，不修改原数组）
        const platformVideos = {
            bilibili: [],
            douyin: [],
            kuaishou: [],
            xiaohongshu: []
        };

        videos.forEach(video => {
            let platform = video.platform;
            if (!platform) {
                // 简单的自动识别逻辑，保持与recommend中一致的判断标准
                if (video.bvid) platform = 'bilibili';
                else if (video.vid) {
                    if (video.url && (video.url.includes('kuaishou') || video.url.includes('chenzhongtech'))) {
                        platform = 'kuaishou';
                    } else if (video.url && (video.url.includes('xiaohongshu') || video.url.includes('xhslink'))) {
                        platform = 'xiaohongshu';
                    } else {
                        platform = 'douyin';
                    }
                }
            }
            if (platform && platformVideos[platform]) {
                platformVideos[platform].push(video);
            }
        });

        // 2. 定义平台配置
        const configs = {
            bilibili: { 
                maxMetrics: 7, 
                fields: ['view', 'danmaku', 'reply', 'favorite', 'coin', 'share', 'like'],
                recommender: this.bilibiliRecommender
            },
            douyin: { 
                maxMetrics: 5, 
                fields: ['reply', 'favorite', 'recommend', 'share', 'like'],
                recommender: this.douyinRecommender
            },
            kuaishou: { 
                maxMetrics: 4, 
                fields: ['view', 'like', 'comment', 'share'],
                recommender: this.kuaishouRecommender
            },
            xiaohongshu: { 
                maxMetrics: 4, 
                fields: ['like', 'comment', 'share', 'favorite'],
                recommender: this.xiaohongshuRecommender
            }
        };

        const results = {};
        
        // 3. 计算各维度系数
        Object.keys(configs).forEach(platform => {
            const config = configs[platform];
            const videos = platformVideos[platform];
            const count = videos.length;
            
            if (count === 0) {
                results[platform] = { V: 0 };
                return;
            }

            // C1: 指标丰富度系数 = 该平台有效指标数 / 最大指标数
            // 计算平均每个视频有多少个有效指标(>0)
            let totalValidMetricCount = 0;
            videos.forEach(v => {
                config.fields.forEach(field => {
                    const val = v.stat ? Number(v.stat[field]) : 0;
                    if (!isNaN(val) && val > 0) totalValidMetricCount++;
                });
            });
            const avgValidMetricCount = totalValidMetricCount / count;
            const C1 = avgValidMetricCount / config.maxMetrics;

            // C2: 数据有效性系数 = 该平台有效视频数 / 该平台总视频数
            let validVideoCount = 0;
            videos.forEach(v => {
                if (config.recommender.isValidVideo(v)) validVideoCount++;
            });
            const C2 = validVideoCount / count;

            // C3: 互动质量系数 = 该平台互动率均值 / 最大互动率均值
            let totalIR = 0;
            videos.forEach(v => {
                const stat = v.stat || {};
                let interactions = 0;
                // 互动数 = 所有非view指标之和
                config.fields.forEach(f => {
                    if (f !== 'view') {
                        interactions += Number(stat[f]) || 0;
                    }
                });
                
                // 分母：播放量，无播放量用点赞数
                let denominator = Number(stat.view);
                if (!denominator || denominator <= 0) {
                    denominator = Number(stat.like) || 1;
                }
                
                totalIR += interactions / denominator;
            });
            const avgIR = totalIR / count;
            
            results[platform] = { C1, C2, avgIR };
        });

        // 获取最大互动率均值
        let maxAvgIR = 0;
        Object.values(results).forEach(r => {
            if (r.avgIR > maxAvgIR) maxAvgIR = r.avgIR;
        });

        // 计算V值
        let totalV = 0;
        Object.keys(results).forEach(platform => {
            const r = results[platform];
            if (r.V === 0) return; // 已经设为0了

            const C3 = maxAvgIR > 0 ? (r.avgIR / maxAvgIR) : 0;
            r.V = (r.C1 * 0.4) + (r.C2 * 0.3) + (C3 * 0.3);
            totalV += r.V;
        });

        // 4. 计算权重W
        const weights = { bilibili: 0, douyin: 0, kuaishou: 0, xiaohongshu: 0 };
        if (totalV > 0) {
            Object.keys(results).forEach(platform => {
                if (results[platform].V > 0) {
                    weights[platform] = parseFloat((results[platform].V / totalV).toFixed(3));
                }
            });
            
            // 归一化修正，确保和为1
            const currentSum = weights.bilibili + weights.douyin + weights.kuaishou + weights.xiaohongshu;
            if (currentSum !== 1 && currentSum > 0) {
                // 将误差加到权重最大的平台
                const maxPlatform = Object.keys(weights).reduce((a, b) => weights[a] > weights[b] ? a : b);
                weights[maxPlatform] = parseFloat((weights[maxPlatform] + (1 - currentSum)).toFixed(3));
            }
        } else {
             // 默认均分
             weights.bilibili = 0.25;
             weights.douyin = 0.25;
             weights.kuaishou = 0.25;
             weights.xiaohongshu = 0.25;
        }

        return weights;
    }
    
    /**
     * 计算视频的综合得分并排序
     * @param {Array} videos 混合视频数据数组
     * @returns {Array} 带综合得分并排序的视频数组
     */
    recommend(videos) {
        if (!videos || videos.length === 0) {
            return [];
        }
        
        // 自动重新计算平台权重（确保使用当前数据的特征）
        this.platformWeights = this.calculatePlatformWeights(videos);
        
        // 按平台分类视频
        const bilibiliVideos = videos.filter(video => video.platform === 'bilibili');
        const douyinVideos = videos.filter(video => video.platform === 'douyin');
        const kuaishouVideos = videos.filter(video => video.platform === 'kuaishou');
        const xiaohongshuVideos = videos.filter(video => video.platform === 'xiaohongshu');
        
        // 兼容处理：如果没有platform字段，尝试通过ID字段识别（仅作为后备）
        const unclassifiedVideos = videos.filter(video => !video.platform);
        if (unclassifiedVideos.length > 0) {
            unclassifiedVideos.forEach(video => {
                if (video.bvid) {
                    video.platform = 'bilibili';
                    bilibiliVideos.push(video);
                } else if (video.vid) {
                    // 区分抖音和快手：快手通常有url包含kuaishou，或者我们在解析时已经标记
                    // 这里假设如果有vid但没有platform，且url包含kuaishou则为快手，否则默认为抖音
                    if (video.url && (video.url.includes('kuaishou') || video.url.includes('chenzhongtech'))) {
                        video.platform = 'kuaishou';
                        kuaishouVideos.push(video);
                    } else if (video.url && (video.url.includes('xiaohongshu') || video.url.includes('xhslink'))) {
                        video.platform = 'xiaohongshu';
                        xiaohongshuVideos.push(video);
                    } else {
                        video.platform = 'douyin';
                        douyinVideos.push(video);
                    }
                }
            });
        }
        
        // 分别处理不同平台的视频
        const rankedBilibiliVideos = this.bilibiliRecommender.recommend(bilibiliVideos);
        const rankedDouyinVideos = this.douyinRecommender.recommend(douyinVideos);
        const rankedKuaishouVideos = this.kuaishouRecommender.recommend(kuaishouVideos);
        const rankedXiaohongshuVideos = this.xiaohongshuRecommender.recommend(xiaohongshuVideos);
        
        // 计算跨平台标准化分数
        const allRankedVideos = [
            ...this.normalizeCrossPlatformScores(rankedBilibiliVideos, 'bilibili'),
            ...this.normalizeCrossPlatformScores(rankedDouyinVideos, 'douyin'),
            ...this.normalizeCrossPlatformScores(rankedKuaishouVideos, 'kuaishou'),
            ...this.normalizeCrossPlatformScores(rankedXiaohongshuVideos, 'xiaohongshu')
        ];
        
        // 结果去重
        const uniqueRankedVideos = [];
        const seenRankedIds = new Set();
        
        allRankedVideos.forEach(video => {
            let id = video.bvid || video.vid;
            if (!id && video.url) id = video.url;
            
            // 如果实在没有标识符，就允许通过（避免误删）
            if (!id) {
                uniqueRankedVideos.push(video);
                return;
            }
            
            const key = `${video.platform}-${id}`;
            if (!seenRankedIds.has(key)) {
                seenRankedIds.add(key);
                uniqueRankedVideos.push(video);
            }
        });
        
        // 按最终得分降序排序
        return uniqueRankedVideos.sort((a, b) => b.finalScore - a.finalScore);
    }
    
    /**
     * 标准化跨平台分数
     * @param {Array} rankedVideos 排序后的视频数组
     * @param {string} platform 平台名称
     * @returns {Array} 添加了跨平台标准化分数的视频数组
     */
    normalizeCrossPlatformScores(rankedVideos, platform) {
        if (rankedVideos.length === 0) return [];
        
        // 计算有效平台数量（权重 > 0 的平台数）
        const activePlatformCount = Object.values(this.platformWeights).filter(w => w > 0).length || 3;

        // 直接使用各平台的原始得分（0-100），不再进行组内归一化
        // 这样可以保留时间衰减的绝对效果
        // 例如：B站老视频得分5分，抖音新视频得分100分
        // 如果不归一化：B站最终分 = 5 * 0.34 = 1.7；抖音最终分 = 100 * 0.33 = 33
        // 如果归一化：B站(Max=5) -> 1.0 -> 34分；抖音(Max=100) -> 1.0 -> 33分 (这就错误地让老视频赢了)
        
        return rankedVideos.map(video => {
            // video.totalScore 已经是 0-100 的数值
            const rawScore = video.totalScore;
            
            // 计算最终得分 (直接应用平台权重，并乘以有效平台数量系数以符合认知习惯)
            const finalScore = rawScore * this.platformWeights[platform] * activePlatformCount;
            
            return {
                ...video,
                normalizedScore: parseFloat((rawScore / 100).toFixed(4)), // 记录一下相对满分的比例
                finalScore: parseFloat(finalScore.toFixed(4))
            };
        });
    }
    
    /**
     * 生成评分详情Tooltip
     * @param {Object} video 视频数据
     * @returns {string} Tooltip文本
     */
    generateTooltip(video) {
        const platform = video.platform;
        let platformWeight = this.platformWeights[platform] || 0;
        let platformName = '';
        let recommender = null;
        let fieldNames = {};

        if (platform === 'bilibili') {
            platformName = 'B站';
            recommender = this.bilibiliRecommender;
            fieldNames = {
                view: '播放量', danmaku: '弹幕数', reply: '评论数', 
                favorite: '收藏数', coin: '硬币数', share: '分享数', like: '点赞数'
            };
        } else if (platform === 'douyin') {
            platformName = '抖音';
            recommender = this.douyinRecommender;
            fieldNames = {
                reply: '评论数', favorite: '收藏数', recommend: '推荐数', 
                share: '分享数', like: '点赞数'
            };
        } else if (platform === 'kuaishou') {
            platformName = '快手';
            recommender = this.kuaishouRecommender;
            fieldNames = {
                view: '播放量', like: '点赞数', comment: '评论数', share: '分享数'
            };
        } else if (platform === 'xiaohongshu') {
            platformName = '小红书';
            recommender = this.xiaohongshuRecommender;
            fieldNames = {
                like: '点赞数', comment: '评论数', share: '分享数', favorite: '收藏数'
            };
        }

        if (!recommender) return '无法生成详情';
        
        const activePlatformCount = Object.values(this.platformWeights).filter(w => w > 0).length || 3;

        let tooltip = `最终得分: ${video.finalScore.toFixed(4)}\n`;
        
        if (video.isLowData) {
            tooltip += `真实度得分: ${video.realismScore.toFixed(4)} (低数据保护)\n`;
        } else {
            tooltip += `真实度得分: ${video.realismScore !== undefined ? video.realismScore.toFixed(4) : 'N/A'} (Log归一化)\n`;
        }
        
        if (video.interactionRate !== undefined && recommender.maxInteractionRate !== undefined) {
             tooltip += `互动率: ${video.interactionRate.toFixed(6)} / Max(有效): ${recommender.maxInteractionRate.toFixed(6)}\n`;
        }

        tooltip += `----------------\n`;
        tooltip += `公式: 平台分(${video.totalScore.toFixed(4)}) * 平台权重(${platformWeight.toFixed(2)}) * ${activePlatformCount} = ${video.finalScore.toFixed(4)}\n`;
        
        tooltip += `\n[${platformName}] 平台分计算:\n`;
        tooltip += `公式: (基础分*0.8 + 真实度*0.2) * 时间衰减 * 100\n`;

        // Base score calculation
        let baseScore = 0;
        tooltip += `\n1. 基础分 (各指标加权求和):\n`;
        
        Object.entries(recommender.weights).forEach(([field, weight]) => {
            const rawValue = this.formatNumber(video.stat[field]);
            const normScore = video.scores && video.scores[field] !== undefined ? video.scores[field].toFixed(4) : '0.0000';
            const contribution = (video.scores && video.scores[field] !== undefined ? video.scores[field] * weight : 0).toFixed(4);
            tooltip += `   - ${fieldNames[field] || field}: 原始[${rawValue}] -> 归一化[${normScore}] * 权重[${weight}] = ${contribution}\n`;
            if (video.scores && video.scores[field]) baseScore += video.scores[field] * weight;
        });
        
        tooltip += `   基础分合计: ${baseScore.toFixed(4)}\n`;
        
        // Realism Score
        const realismScore = video.realismScore !== undefined ? video.realismScore : 0;
        tooltip += `   真实度得分: ${realismScore.toFixed(4)} (Log归一化)\n`;

        // Time decay
        const timeDecay = video.timeDecay !== undefined ? video.timeDecay : 1;
        tooltip += `\n2. 时间衰减: ${timeDecay.toFixed(4)}\n`;
        if (timeDecay < 1) {
             tooltip += `   (半衰期: ${this.timeDecayHalfLife}天)\n`;
        }
        
        tooltip += `\n平台分: (${baseScore.toFixed(4)}*0.8 + ${realismScore.toFixed(4)}*0.2) * ${timeDecay.toFixed(4)} * 100 = ${video.totalScore.toFixed(4)}`;
        
        return tooltip;
    }

    /**
     * 获取推荐结果中的Top N视频
     * @param {Array} rankedVideos 排序后的视频数组
     * @param {number} n 获取的数量
     * @returns {Array} Top N视频
     */
    getTopVideos(rankedVideos, n = 5) {
        return rankedVideos.slice(0, Math.min(n, rankedVideos.length));
    }
    
    /**
     * 生成混合平台推荐报告
     * @param {Array} rankedVideos 排序后的视频数组
     * @param {number} topN 显示Top N数量
     * @returns {string} 推荐报告HTML
     */
    generateRecommendationReport(rankedVideos, topN = 5) {
        if (rankedVideos.length === 0) {
            return '<div class="recommendation-report"><p>没有足够的有效视频数据生成推荐</p></div>';
        }
        
        const topVideos = this.getTopVideos(rankedVideos, topN);
        
        // 构建行排列（列表视图）的HTML
        let listHtml = `
            <div class="recommendation-view list-view" style="display: block;">
                <ul style="padding-left: 0; list-style: none;">
        `;
        
        topVideos.forEach((video, index) => {
            let coverUrl = video.pic || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            if (video.platform === 'bilibili' && coverUrl.startsWith('http')) {
                coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
            }
            let platformColor = '#FB7299';
            let platformName = 'B站';
            
            if (video.platform === 'douyin') {
                platformColor = '#FE2C55';
                platformName = '抖音';
            } else if (video.platform === 'kuaishou') {
                platformColor = '#FF5000';
                platformName = '快手';
            } else if (video.platform === 'xiaohongshu') {
                platformColor = '#ff2442';
                platformName = '小红书';
            }
            
            // 根据平台生成不同的播放链接
            let platformLink, platformUrl;
            if (video.platform === 'bilibili') {
                platformLink = `https://www.bilibili.com/video/${video.bvid}`;
                platformUrl = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #5da6efff; text-decoration: none;">播放直链</a>` : '';
            } else if (video.platform === 'douyin') {
                platformLink = `https://www.douyin.com/video/${video.vid}`;
                platformUrl = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #5da6efff; text-decoration: none;">播放直链</a>` : '';
            } else if (video.platform === 'kuaishou') {
                platformLink = video.url || '#';
                platformUrl = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #5da6efff; text-decoration: none;">播放直链</a>` : '';
            } else if (video.platform === 'xiaohongshu') {
                platformLink = video.url || '#';
                platformUrl = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #5da6efff; text-decoration: none;">播放直链</a>` : '';
            }
            
            // 构建统计信息
            let statInfo = '';
            if (video.platform === 'bilibili' && video.stat) {
                statInfo = `播放：${this.formatNumber(video.stat.view)} | 点赞：${this.formatNumber(video.stat.like)} | 评论：${this.formatNumber(video.stat.reply)} | 收藏：${this.formatNumber(video.stat.favorite)}`;
            } else if (video.platform === 'douyin' && video.stat) {
                statInfo = `点赞：${this.formatNumber(video.stat.like)} | 评论：${this.formatNumber(video.stat.reply)} | 收藏：${this.formatNumber(video.stat.favorite)} | 推荐：${this.formatNumber(video.stat.recommend)}`;
            } else if (video.platform === 'kuaishou' && video.stat) {
                statInfo = `播放：${this.formatNumber(video.stat.view)} | 点赞：${this.formatNumber(video.stat.like)} | 评论：${this.formatNumber(video.stat.comment)} | 分享：${this.formatNumber(video.stat.share)}`;
            } else if (video.platform === 'xiaohongshu' && video.stat) {
                statInfo = `点赞：${this.formatNumber(video.stat.like)} | 评论：${this.formatNumber(video.stat.comment)} | 分享：${this.formatNumber(video.stat.share)} | 收藏：-`;
            }
            
            listHtml += `
                <li style="margin: 0.8rem 0; display: flex; align-items: flex-start; gap: 1rem;">
                    <div style="width: 160px; height: 90.6px; flex-shrink: 0; border-radius: 4px; overflow: hidden;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="width: 100%; height: 100%; object-fit: cover; border: none;">
                    </div>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.1em; color: #333;">${index + 1}. ${video.title}</strong>
                        <span style="display: inline-block; margin-left: 0.5rem; padding: 0.1rem 0.4rem; border-radius: 4px; 
                              background-color: ${platformColor}; color: white; font-size: 0.7rem;">${platformName}</span>
                        <br>作者：${video.author} | 平台得分：${video.totalScore.toFixed(4)} | <span style="font-weight: bold; cursor: help; border-bottom: 1px dashed #333;" title="${this.generateTooltip(video)}">最终得分：${video.finalScore.toFixed(4)}</span>
                        <br>${statInfo}
                        <br><a href="${platformLink}" target="_blank" style="color: #23ade5; text-decoration: none;">跳转播放</a>${platformUrl}
                    </div>
                </li>
            `;
        });
        listHtml += `</ul></div>`;

        // 构建列排列（卡片视图）的HTML
        let gridHtml = `
            <div class="recommendation-view grid-view" style="display: none; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
        `;
        
        topVideos.forEach((video, index) => {
            let coverUrl = video.pic || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            if (video.platform === 'bilibili' && coverUrl.startsWith('http')) {
                coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
            }
            let platformColor = '#FB7299';
            let platformName = 'B站';
            
            if (video.platform === 'douyin') {
                platformColor = '#FE2C55';
                platformName = '抖音';
            } else if (video.platform === 'kuaishou') {
                platformColor = '#FF5000';
                platformName = '快手';
            } else if (video.platform === 'xiaohongshu') {
                platformColor = '#ff2442';
                platformName = '小红书';
            }

            // 播放链接
            let platformLink = '#';
            if (video.platform === 'bilibili') {
                platformLink = `https://www.bilibili.com/video/${video.bvid}`;
            } else if (video.platform === 'douyin') {
                platformLink = `https://www.douyin.com/video/${video.vid}`;
            } else if (video.platform === 'kuaishou') {
                platformLink = video.url || '#';
            } else if (video.platform === 'xiaohongshu') {
                platformLink = video.url || '#';
            }

            // 底部数据展示
            let bottomStats = '';
            if (video.platform === 'bilibili') {
                bottomStats = `<span style="margin-right: 8px;">播放 ${this.formatNumber(video.stat.view)}</span><span>点赞 ${this.formatNumber(video.stat.like)}</span>`;
            } else if (video.platform === 'douyin') {
                bottomStats = `<span style="margin-right: 8px;">点赞 ${this.formatNumber(video.stat.like)}</span><span>收藏 ${this.formatNumber(video.stat.favorite)}</span>`;
            } else if (video.platform === 'kuaishou') {
                bottomStats = `<span style="margin-right: 8px;">播放 ${this.formatNumber(video.stat.view)}</span><span>点赞 ${this.formatNumber(video.stat.like)}</span>`;
            } else if (video.platform === 'xiaohongshu') {
                bottomStats = `<span style="margin-right: 8px;">点赞 ${this.formatNumber(video.stat.like)}</span><span>分享 ${this.formatNumber(video.stat.share)}</span>`;
            }

            gridHtml += `
                <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
                    <div style="position: relative; padding-top: 56.25%;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                        <span style="position: absolute; top: 0; left: 0; background: ${platformColor}; color: white; padding: 2px 8px; font-size: 12px; border-bottom-right-radius: 8px; font-weight: bold;">TOP ${index + 1} ${platformName}</span>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 20px 10px 5px; color: white; font-size: 12px;">
                            ${bottomStats}
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; font-weight: bold; margin-bottom: 8px; line-height: 1.4;">${video.title}</div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">作者：${video.author}</div>
                        <div style="font-size: 13px; color: #23ade5; font-weight: bold; margin-bottom: 8px; cursor: help;" title="${this.generateTooltip(video)}">最终得分：${video.finalScore.toFixed(4)}</div>
                        <div style="display: flex; gap: 8px;">
                            <a href="${platformLink}" target="_blank" style="flex: 1; display: block; text-align: center; background: #f1f2f3; color: #333; text-decoration: none; padding: 6px 0; border-radius: 4px; font-size: 12px;">立即观看</a>
                            ${video.url ? `<a href="${video.url}" target="_blank" style="flex: 1; display: block; text-align: center; background: #e6f7ff; color: #23ade5; text-decoration: none; padding: 6px 0; border-radius: 4px; font-size: 12px;">播放直链</a>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        gridHtml += `</div>`;
        
        let report = `
            <div class="recommendation-report" style="margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; color: #23ade5; display: inline-block; vertical-align: middle;">混合平台视频推荐结果</h3>
                        <span style="margin-left: 10px; font-size: 0.9em; color: #666;">基于综合评分（播放量、互动数据等）推荐以下最佳视频</span>
                    </div>
                    <div class="view-toggle" style="background: #e0e0e0; border-radius: 4px; padding: 2px;">
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='block';this.closest('.recommendation-report').querySelector('.grid-view').style.display='none';this.style.background='#fff';this.nextElementSibling.style.background='transparent';" style="border: none; background: #fff; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">列表</button>
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='none';this.closest('.recommendation-report').querySelector('.grid-view').style.display='grid';this.style.background='#fff';this.previousElementSibling.style.background='transparent';" style="border: none; background: transparent; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">卡片</button>
                    </div>
                </div>
                
                ${listHtml}
                ${gridHtml}
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed #ddd; font-size: 0.9rem; color: #666;">
                    <p style="margin: 0 0 8px 0;"><strong>评分依据：</strong></p>
                    <ul style="padding-left: 1.5rem;">
        `;
        
        // 添加平台权重说明
        report += `
                        <li style="margin-bottom: 0.5rem;"><strong>平台权重：</strong></li>
                        <ul style="padding-left: 1.5rem;">
                            <li>B站: ${(this.platformWeights.bilibili * 100).toFixed(0)}%</li>
                            <li>抖音: ${(this.platformWeights.douyin * 100).toFixed(0)}%</li>
                            <li>快手: ${(this.platformWeights.kuaishou * 100).toFixed(0)}%</li>
                            <li>小红书: ${(this.platformWeights.xiaohongshu * 100).toFixed(0)}%</li>
                        </ul>
                        <li style="margin-top: 0.5rem; margin-bottom: 0.5rem;"><strong>时间衰减：</strong></li>
                        <ul style="padding-left: 1.5rem;">
                            <li>半衰期: ${this.timeDecayHalfLife} 天 (每过 ${this.timeDecayHalfLife} 天分数减半)</li>
                        </ul>
        `;
        
        // 添加B站指标权重说明
        report += `
                        <li style="margin-top: 0.5rem; margin-bottom: 0.5rem;"><strong>B站指标权重：</strong></li>
                        <ul style="padding-left: 1.5rem;">
        `;
        const bilibiliFieldNames = {
            view: '播放量',
            danmaku: '弹幕数',
            reply: '评论数',
            favorite: '收藏数',
            coin: '硬币数',
            share: '分享数',
            like: '点赞数'
        };
        Object.entries(this.bilibiliRecommender.weights).forEach(([field, weight]) => {
            report += `<li>${bilibiliFieldNames[field]}: ${(weight * 100).toFixed(0)}%</li>`;
        });
        
        // 添加抖音指标权重说明
        report += `
                        </ul>
                        <li style="margin-top: 0.5rem; margin-bottom: 0.5rem;"><strong>抖音指标权重：</strong></li>
                        <ul style="padding-left: 1.5rem;">
        `;
        const douyinFieldNames = {
            reply: '评论数',
            favorite: '收藏数',
            recommend: '推荐数',
            share: '分享数',
            like: '点赞数'
        };
        Object.entries(this.douyinRecommender.weights).forEach(([field, weight]) => {
            report += `<li>${douyinFieldNames[field]}: ${(weight * 100).toFixed(0)}%</li>`;
        });
        
        report += `
                        </ul>
                        <li style="margin-top: 0.5rem; margin-bottom: 0.5rem;"><strong>快手指标权重：</strong></li>
                        <ul style="padding-left: 1.5rem;">
        `;
        
        const kuaishouFieldNames = {
            view: '播放量',
            like: '点赞数',
            comment: '评论数',
            share: '分享数'
        };
        Object.entries(this.kuaishouRecommender.weights).forEach(([field, weight]) => {
            report += `<li>${kuaishouFieldNames[field]}: ${(weight * 100).toFixed(0)}%</li>`;
        });
        
        report += `
                        </ul>
                        <li style="margin-top: 0.5rem; margin-bottom: 0.5rem;"><strong>小红书指标权重：</strong></li>
                        <ul style="padding-left: 1.5rem;">
        `;
        
        const xiaohongshuFieldNames = {
            like: '点赞数',
            comment: '评论数',
            share: '分享数',
            favorite: '收藏数'
        };
        Object.entries(this.xiaohongshuRecommender.weights).forEach(([field, weight]) => {
            report += `<li>${xiaohongshuFieldNames[field]}: ${(weight * 100).toFixed(0)}%</li>`;
        });
        
        const activePlatformCount = Object.values(this.platformWeights).filter(w => w > 0).length || 3;
        
        report += `
                        </ul>
                    </ul>
                    
                    <p style="margin-top: 0.8rem;"><strong>评分算法说明：</strong>首先分别计算各平台视频的综合得分，然后进行跨平台标准化，最后应用平台权重计算最终得分（并乘以${activePlatformCount}倍[有效平台数]以还原分数量级）。</p>
                </div>
            </div>
        `;
        
        return report;
    }
    
    /**
     * 数字格式化（添加千位分隔符）
     * @param {number} num 数字
     * @returns {string} 格式化后的数字字符串
     */
    formatNumber(num) {
        // 确保num是数字
        const number = Number(num);
        if (isNaN(number)) return '0';
        return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    
    /**
     * 设置平台权重
     * @param {Object} weights 平台权重配置
     */
    setPlatformWeights(weights) {
        this.platformWeights = { ...this.platformWeights, ...weights };
        // 确保权重总和为1
        const totalWeight = Object.values(this.platformWeights).reduce((sum, weight) => sum + weight, 0);
        if (totalWeight !== 1) {
            Object.keys(this.platformWeights).forEach(platform => {
                this.platformWeights[platform] /= totalWeight;
            });
        }
    }
    
    /**
     * 设置B站指标权重
     * @param {Object} weights 指标权重配置
     */
    setBilibiliWeights(weights) {
        this.bilibiliRecommender.weights = { ...this.bilibiliRecommender.weights, ...weights };
    }
    
    /**
     * 设置抖音指标权重
     * @param {Object} weights 指标权重配置
     */
    setDouyinWeights(weights) {
        this.douyinRecommender.weights = { ...this.douyinRecommender.weights, ...weights };
    }
    /**
     * 设置快手指标权重
     * @param {Object} weights 指标权重配置
     */
    setKuaishouWeights(weights) {
        this.kuaishouRecommender.weights = { ...this.kuaishouRecommender.weights, ...weights };
    }
    
    /**
     * 设置小红书指标权重
     * @param {Object} weights 指标权重配置
     */
    setXiaohongshuWeights(weights) {
        this.xiaohongshuRecommender.weights = { ...this.xiaohongshuRecommender.weights, ...weights };
    }

    /**
     * 设置时间衰减半衰期
     * @param {number} days 天数
     */
    setTimeDecayHalfLife(days) {
        this.timeDecayHalfLife = days;
        if (this.bilibiliRecommender) this.bilibiliRecommender.timeDecayHalfLife = days;
        if (this.douyinRecommender) this.douyinRecommender.timeDecayHalfLife = days;
        if (this.kuaishouRecommender) this.kuaishouRecommender.timeDecayHalfLife = days;
        if (this.xiaohongshuRecommender) this.xiaohongshuRecommender.timeDecayHalfLife = days;
    }
}

// 在浏览器环境中，确保VideoBiliRecommender和VideoDouyinRecommender类已加载
if (typeof window !== 'undefined') {
    // 如果这两个类还没有在全局作用域中，尝试导入它们
    if (typeof VideoBiliRecommender === 'undefined' || typeof VideoDouyinRecommender === 'undefined' || typeof VideoKuaishouRecommender === 'undefined' || typeof VideoXiaohongshuRecommender === 'undefined') {
        console.warn('VideoBiliRecommender或VideoDouyinRecommender或VideoKuaishouRecommender或VideoXiaohongshuRecommender未定义，请确保algVideo.js已加载');
        
        // 为了防止错误，可以在此处添加一个简单的回退实现
        window.VideoBiliRecommender = window.VideoBiliRecommender || class {
            constructor() {}
            recommend(videos) { return videos || []; }
        };
        
        window.VideoDouyinRecommender = window.VideoDouyinRecommender || class {
            constructor() {}
            recommend(videos) { return videos || []; }
        };

        window.VideoKuaishouRecommender = window.VideoKuaishouRecommender || class {
            constructor() {}
            recommend(videos) { return videos || []; }
        };

        window.VideoXiaohongshuRecommender = window.VideoXiaohongshuRecommender || class {
            constructor() {}
            recommend(videos) { return videos || []; }
        };
    }
    
    // 将MixedVideoRecommender添加到全局作用域
    window.MixedVideoRecommender = MixedVideoRecommender;
}

// 确保在DOM加载完成后初始化
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // 混合推荐按钮的点击事件可以在这里定义，或者在batch2.0.html中定义
    });
}
