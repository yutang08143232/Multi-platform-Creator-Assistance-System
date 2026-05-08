/**
 * 视频综合评分与推荐工具
 * 用于根据视频统计数据计算综合得分并推荐最佳视频
 */
class VideoBiliRecommender {
    /**
     * 初始化推荐器
     * @param {Object} options 配置参数
     * @param {Object} options.weights 各指标权重配置，默认：{view: 0.1, danmaku: 0.15, reply: 0.15, favorite: 0.4, coin: 0.15, share: 0.2, like: 0.15}
     * @param {number} options.normalizationMethod 归一化方法 0:min-max 1:z-score，默认0
     */
    constructor(options = {}) {
        this.weights = options.weights || {
            view: 0.05,       // 播放量权重
            danmaku: 0.1,   // 弹幕数权重
            reply: 0.15,     // 评论数权重
            favorite: 0.25,   // 收藏数权重
            coin: 0.15,      // 硬币数权重
            share: 0.15,      // 分享数权重
            like: 0.15       // 点赞数权重
        };
        
        // 归一化方法，默认使用min-max
        this.normalizationMethod = options.normalizationMethod || 0;
        
        // 时间衰减半衰期（天），默认365天
        this.timeDecayHalfLife = options.timeDecayHalfLife || 365;
        
        // 缓存统计数据
        this.stats = null;
        this.maxInteractionRate = 0;
    }
    
    /**
     * 计算视频的综合得分并排序
     * @param {Array} videos 视频数据数组
     * @returns {Array} 带综合得分并排序的视频数组
     */
    recommend(videos) {
        if (!videos || videos.length === 0) {
            return [];
        }
        
        // 过滤掉数据不完整的视频
        const validVideos = videos.filter(video => this.isValidVideo(video));
        
        if (validVideos.length === 0) {
            return [];
        }
        
        // 计算统计数据（最大值、最小值、平均值、标准差）
        this.calculateStats(validVideos);
        
        // 1. 计算每个视频的互动率并找出最大值（用于计算真实度得分）
        // 优化：排除低播放量/低数据视频参与Max计算，避免极值干扰
        let maxInteractionRate = 0;
        const videoMeta = new Map(); // 存储 { ir, isLowData }
        
        validVideos.forEach(video => {
            const ir = this.calculateInteractionRate(video);
            
            // 判断是否为低数据视频 (播放量 < 2000)
            let isLowData = false;
            let viewCount = this.parseNumber(video.stat.view);
            if (isNaN(viewCount) || viewCount < 2000) {
                isLowData = true;
            }
            
            videoMeta.set(video, { ir, isLowData });
            
            // 仅当非低数据视频时，才参与最大值计算
            if (!isLowData && ir > maxInteractionRate) {
                maxInteractionRate = ir;
            }
        });
        
        // 如果没有合格的视频提供Max值，则回退到使用所有视频的最大值（避免除以0）
        if (maxInteractionRate === 0) {
             validVideos.forEach(video => {
                 const { ir } = videoMeta.get(video);
                 if (ir > maxInteractionRate) maxInteractionRate = ir;
             });
        }
        
        this.maxInteractionRate = maxInteractionRate;

        // 为每个视频计算综合得分
        const scoredVideos = validVideos.map(video => {
            const scores = this.calculateIndicatorScores(video);
            const baseScore = this.calculateTotalScore(scores);
            
            // 计算时间衰减系数
            const timeDecay = this.calculateTimeDecay(video);
            
            // 计算真实度得分 (Log Normalization)
            // ln(1 + x) / ln(1 + max)
            const { ir, isLowData } = videoMeta.get(video);
            let realismScore = 0;
            
            if (isLowData) {
                // 低播放量视频给予固定低分，防止偶然的高互动率霸榜
                realismScore = 0.2; 
            } else {
                realismScore = maxInteractionRate > 0 ? (Math.log(1 + ir) / Math.log(1 + maxInteractionRate)) : 0;
            }
            
            // 应用时间衰减和真实度权重
            // Formula: (Base * 0.8 + Realism * 0.2) * TimeDecay * 100
            const totalScore = (baseScore * 0.8 + realismScore * 0.2) * timeDecay * 100;

            return {
                ...video,
                scores: scores,
                timeDecay: parseFloat(timeDecay.toFixed(4)),
                totalScore: parseFloat(totalScore.toFixed(4)),
                realismScore: parseFloat(realismScore.toFixed(4)), // 新增真实度得分
                interactionRate: parseFloat(ir.toFixed(6)), // 保留互动率供参考
                isLowData: isLowData // 标记是否为低数据视频
            };
        });
        
        // 按综合得分降序排序
        return scoredVideos.sort((a, b) => b.totalScore - a.totalScore);
    }

    /**
     * 计算视频互动率（用于真实度得分）
     * B站权重：评论0.4、收藏0.3、点赞0.2、分享0.1
     * @param {Object} video 视频数据
     * @returns {number} 互动率
     */
    calculateInteractionRate(video) {
        if (!video || !video.stat) return 0;
        
        // 权重配置
        const weights = {
            reply: 0.4,
            favorite: 0.3,
            like: 0.2,
            share: 0.1
        };
        
        // 计算加权互动数
        let weightedInteractions = 0;
        Object.entries(weights).forEach(([field, weight]) => {
            const val = this.parseNumber(video.stat[field]);
            if (!isNaN(val) && val > 0) {
                weightedInteractions += val * weight;
            }
        });
        
        // 分母：播放量（如果无效则用点赞数）
        let denominator = this.parseNumber(video.stat.view);
        if (isNaN(denominator) || denominator <= 0) {
            denominator = this.parseNumber(video.stat.like);
        }
        if (isNaN(denominator) || denominator <= 0) {
            denominator = 1; // 避免除以零
        }
        
        return weightedInteractions / denominator;
    }

    /**
     * 计算时间衰减系数
     * 公式：exp(-ln(2) * days / halfLife)
     * @param {Object} video 视频数据
     * @returns {number} 衰减系数 (0-1)
     */
    calculateTimeDecay(video) {
        // B站视频发布时间在 video.stat.time
        let timestamp = video.stat && video.stat.time ? video.stat.time : null;
        
        // 如果没有找到时间，尝试其他常见字段作为后备
        if (!timestamp) {
            timestamp = video.created || video.ctime || video.pubdate || video.create_time;
        }
        
        if (!timestamp) return 1; // 如果没有时间信息，不进行衰减
        
        // 尝试解析时间
        if (typeof timestamp === 'string' && isNaN(Number(timestamp))) {
            // 可能是日期字符串
            const parsed = Date.parse(timestamp);
            if (!isNaN(parsed)) {
                timestamp = parsed;
            } else {
                return 1; // 无法解析的时间格式
            }
        } else {
            // 是数字或数字字符串
            timestamp = Number(timestamp);
        }

        if (isNaN(timestamp)) return 1;
        
        // 统一转换为毫秒
        // 如果时间戳小于 10000000000 (10位)，认为是秒，需要乘以1000
        if (timestamp < 10000000000) {
            timestamp *= 1000;
        }
        
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        
        // 计算指数衰减
        // lambda = ln(2) / halfLife
        const lambda = Math.LN2 / this.timeDecayHalfLife;
        const decay = Math.exp(-lambda * diffDays);
        
        return decay;
    }
    
    /**
     * 解析数值（支持"1.2万"、"100w"等格式）
     * @param {string|number} value 待解析的数值
     * @returns {number} 解析后的数值，如果解析失败返回NaN
     */
    parseNumber(value) {
        if (value === undefined || value === null || value === '-') return NaN;
        if (typeof value === 'number') return value;
        
        let str = String(value).trim();
        if (str === '') return NaN;
        
        let multiplier = 1;
        if (str.endsWith('w') || str.endsWith('W') || str.endsWith('万')) {
            multiplier = 10000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('k') || str.endsWith('K')) {
            multiplier = 1000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('亿')) {
            multiplier = 100000000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('+')) {
            str = str.substring(0, str.length - 1);
        }
        
        const num = parseFloat(str);
        return isNaN(num) ? NaN : num * multiplier;
    }

    /**
     * 检查视频数据是否有效
     * @param {Object} video 视频数据
     * @returns {boolean} 是否有效
     */
    isValidVideo(video) {
        if (!video || !video.stat) return false;
        
        const requiredFields = ['view', 'danmaku', 'reply', 'favorite', 'coin', 'share', 'like'];
        // 至少需要其中的大多数字段有效才认为是有效视频
        let validCount = 0;
        let totalCount = requiredFields.length;
        
        requiredFields.forEach(field => {
            const value = video.stat[field];
            const num = this.parseNumber(value);
            if (!isNaN(num) && num >= 0) {
                validCount++;
            }
        });
        
        // 如果至少有一半以上的字段有效，则认为是有效视频
        return validCount >= Math.ceil(totalCount / 2);
    }
    
    /**
     * 计算所有视频的统计数据
     * @param {Array} videos 视频数组
     */
    calculateStats(videos) {
        const fields = ['view', 'danmaku', 'reply', 'favorite', 'coin', 'share', 'like'];
        const stats = {};
        
        fields.forEach(field => {
            // 提取所有数值
            const values = videos.map(v => this.parseNumber(v.stat[field])).filter(v => !isNaN(v));
            
            if (values.length === 0) {
                stats[field] = { min: 0, max: 0, mean: 0, std: 0, sum: 0 };
                return;
            }
            
            // 计算基本统计量
            const min = Math.min(...values);
            const max = Math.max(...values);
            const sum = values.reduce((acc, val) => acc + val, 0);
            const mean = sum / values.length;
            
            // 计算标准差
            const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
            const std = Math.sqrt(variance);
            
            stats[field] = { min, max, mean, std, sum };
        });
        
        this.stats = stats;
    }
    
    /**
     * 计算单个视频各指标的得分
     * @param {Object} video 视频数据
     * @returns {Object} 各指标得分
     */
    calculateIndicatorScores(video) {
        const scores = {};
        
        Object.keys(this.weights).forEach(field => {
            const value = this.parseNumber(video.stat[field]);
            const stat = this.stats[field];
            
            if (isNaN(value)) {
                scores[field] = 0;
                return;
            }
            
            // 根据选择的归一化方法计算得分（0-1之间）
            if (this.normalizationMethod === 0) {
                // Min-Max归一化 (使用对数优化，处理长尾分布)
                const logValue = Math.log(value + 1);
                const logMin = Math.log(stat.min + 1);
                const logMax = Math.log(stat.max + 1);
                
                scores[field] = logMax !== logMin 
                    ? (logValue - logMin) / (logMax - logMin) 
                    : 1.0; // 当所有值相同时，给予满分
            } else {
                // Z-Score标准化，然后映射到0-1区间
                const zScore = stat.std !== 0 ? (value - stat.mean) / stat.std : 0;
                // 使用Sigmoid函数将Z-Score映射到0-1
                scores[field] = 1 / (1 + Math.exp(-zScore));
            }
        });
        
        return scores;
    }
    
    /**
     * 计算综合得分
     * @param {Object} scores 各指标得分
     * @returns {number} 综合得分
     */
    calculateTotalScore(scores) {
        let total = 0;
        
        Object.keys(this.weights).forEach(field => {
            total += scores[field] * this.weights[field];
        });
        
        return total;
    }
    
    /**
     * 生成评分详情Tooltip
     * @param {Object} video 视频数据
     * @returns {string} Tooltip文本
     */
    generateTooltip(video) {
        let tooltip = `综合得分: ${video.totalScore.toFixed(4)}\n`;
        
        if (video.isLowData) {
            tooltip += `真实度得分: ${video.realismScore.toFixed(4)} (低数据保护: 播放<2000)\n`;
        } else {
            tooltip += `真实度得分: ${video.realismScore !== undefined ? video.realismScore.toFixed(4) : 'N/A'} (Log归一化)\n`;
        }
        
        if (video.interactionRate !== undefined && this.maxInteractionRate !== undefined) {
             tooltip += `互动率: ${video.interactionRate.toFixed(6)} / Max(有效): ${this.maxInteractionRate.toFixed(6)}\n`;
             tooltip += `(算法: 加权互动数 / 播放量)\n`;
        }
        tooltip += `----------------\n`;
        tooltip += `公式: (基础分*0.8 + 真实度*0.2) * 时间衰减 * 100\n`;
        
        // Base score calculation
        let baseScore = 0;
        tooltip += `\n1. 基础分 (各指标加权求和):\n`;
        const fieldNames = {
            view: '播放量', danmaku: '弹幕数', reply: '评论数', 
            favorite: '收藏数', coin: '硬币数', share: '分享数', like: '点赞数'
        };
        
        Object.entries(this.weights).forEach(([field, weight]) => {
            const rawValue = this.formatNumber(video.stat[field]);
            const normScore = video.scores && video.scores[field] !== undefined ? video.scores[field].toFixed(4) : '0.0000';
            const contribution = (video.scores && video.scores[field] !== undefined ? video.scores[field] * weight : 0).toFixed(4);
            tooltip += `   - ${fieldNames[field] || field}: 原始[${rawValue}] -> 归一化[${normScore}] * 权重[${weight}] = ${contribution}\n`;
            if (video.scores && video.scores[field]) baseScore += video.scores[field] * weight;
        });
        
        tooltip += `   基础分合计: ${baseScore.toFixed(4)}\n`;
        
        // Time decay
        const timeDecay = video.timeDecay !== undefined ? video.timeDecay : 1;
        tooltip += `\n2. 时间衰减: ${timeDecay.toFixed(4)}\n`;
        if (timeDecay < 1) {
             tooltip += `   (半衰期: ${this.timeDecayHalfLife}天)\n`;
        }
        
        tooltip += `\n计算: (${baseScore.toFixed(4)}*0.8 + ${video.realismScore.toFixed(4)}*0.2) * ${timeDecay.toFixed(4)} * 100 = ${video.totalScore.toFixed(4)}`;
        
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
     * 生成推荐报告
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
            if (coverUrl.startsWith('http')) {
                coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
            }
            const playLink = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #23ade5; text-decoration: none;">播放直链</a>` : '';
            
            listHtml += `
                <li style="margin: 0.8rem 0; display: flex; align-items: flex-start; gap: 1rem;">
                    <div style="width: 160px; height: 90.6px; flex-shrink: 0; border-radius: 4px; overflow: hidden;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="width: 100%; height: 100%; object-fit: cover; border: none;">
                    </div>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.1em; color: #333;">${index + 1}. ${video.title}</strong>
                        <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                            作者：${video.author} <span style="margin: 0 5px; color: #ddd;">|</span> 
                            <span style="color: #fb7299; font-weight: bold; cursor: help; border-bottom: 1px dashed #fb7299;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</span>
                        </div>
                        <div style="margin-top: 5px; font-size: 0.85em; color: #888; display: flex; flex-wrap: wrap; gap: 10px;">
                            <span>播放：${this.formatNumber(video.stat.view)}</span>
                            <span>点赞：${this.formatNumber(video.stat.like)}</span>
                            <span>评论：${this.formatNumber(video.stat.reply)}</span>
                            <span>收藏：${this.formatNumber(video.stat.favorite)}</span>
                            <span>硬币：${this.formatNumber(video.stat.coin)}</span>
                            <span>分享：${this.formatNumber(video.stat.share)}</span>
                        </div>
                        <div style="margin-top: 8px;">
                            <a href="https://www.bilibili.com/video/${video.bvid}" target="_blank" style="display: inline-block; padding: 4px 12px; background: #23ade5; color: white; text-decoration: none; border-radius: 4px; font-size: 0.85em;">跳转播放</a>
                            ${playLink ? `<a href="${video.url}" target="_blank" style="display: inline-block; margin-left: 8px; padding: 4px 12px; background: #e7f5fb; color: #23ade5; text-decoration: none; border-radius: 4px; font-size: 0.85em;">播放直链</a>` : ''}
                        </div>
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
            if (coverUrl.startsWith('http')) {
                coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
            }
            
            gridHtml += `
                <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
                    <div style="position: relative; padding-top: 56.25%;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                        <span style="position: absolute; top: 0; left: 0; background: #fb7299; color: white; padding: 2px 8px; font-size: 12px; border-bottom-right-radius: 8px; font-weight: bold;">TOP ${index + 1}</span>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 20px 10px 5px; color: white; font-size: 12px;">
                            <span style="margin-right: 8px;">播放 ${this.formatNumber(video.stat.view)}</span>
                            <span>弹幕 ${this.formatNumber(video.stat.danmaku)}</span>
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; font-weight: bold; margin-bottom: 8px; line-height: 1.4;">${video.title}</div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">UP主：${video.author}</div>
                        <div style="font-size: 13px; color: #fb7299; font-weight: bold; margin-bottom: 8px; cursor: help;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</div>
                        <a href="https://www.bilibili.com/video/${video.bvid}" target="_blank" style="display: block; text-align: center; background: #f1f2f3; color: #333; text-decoration: none; padding: 6px 0; border-radius: 4px; font-size: 12px;">立即观看</a>
                    </div>
                </div>
            `;
        });
        gridHtml += `</div>`;
        
        // 组合最终报告
        let report = `
            <div class="recommendation-report" style="margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; color: #23ade5; display: inline-block; vertical-align: middle;">视频推荐结果</h3>
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
                    <p style="margin: 0 0 8px 0;"><strong>评分模型权重说明：</strong></p>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        `;
        
        // 添加权重说明
        Object.entries(this.weights).forEach(([field, weight]) => {
            const fieldNames = {
                view: '播放量',
                danmaku: '弹幕数',
                reply: '评论数',
                favorite: '收藏数',
                coin: '硬币数',
                share: '分享数',
                like: '点赞数'
            };
            
            report += `<span style="background: #e7f5fb; color: #23ade5; padding: 2px 8px; border-radius: 4px;">${fieldNames[field]}: ${(weight * 100).toFixed(0)}%</span>`;
        });
        
        // 添加半衰期说明
        report += `<span style="background: #f0f0f0; color: #666; padding: 2px 8px; border-radius: 4px;">时间衰减半衰期: ${this.timeDecayHalfLife}天</span>`;
        
        report += `
                    </div>
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
        if (num === undefined || num === null || num === '-') {
            return '-';
        }
        if (typeof num === 'string' && isNaN(num)) {
            return num;
        }
        return parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
}

class VideoDouyinRecommender {
    /**
     * 初始化推荐器
     * @param {Object} options 配置参数
     * @param {Object} options.weights 各指标权重配置，默认：{view: 0.05, reply: 0.15, favorite: 0.25, recommend: 0.15, share: 0.15, like: 0.15}
     * @param {number} options.normalizationMethod 归一化方法 0:min-max 1:z-score，默认0
     */
    constructor(options = {}) {
        this.weights = options.weights || {
            reply: 0.15,     // 评论数权重
            favorite: 0.25,   // 收藏数权重
            recommend: 0.20,      // 推荐数权重
            share: 0.15,      // 分享数权重
            like: 0.15       // 点赞数权重
        };
        
        // 归一化方法，默认使用min-max
        this.normalizationMethod = options.normalizationMethod || 0;
        
        // 时间衰减半衰期（天），默认365天
        this.timeDecayHalfLife = options.timeDecayHalfLife || 365;
        
        // 缓存统计数据
        this.stats = null;
        this.maxInteractionRate = 0;
    }
    
    /**
     * 计算视频的综合得分并排序
     * @param {Array} videos 视频数据数组
     * @returns {Array} 带综合得分并排序的视频数组
     */
    recommend(videos) {
        if (!videos || videos.length === 0) {
            return [];
        }
        
        // 过滤掉数据不完整的视频
        const validVideos = videos.filter(video => this.isValidVideo(video));
        
        if (validVideos.length === 0) {
            return [];
        }
        
        // 计算统计数据（最大值、最小值、平均值、标准差）
        this.calculateStats(validVideos);
        
        // 1. 计算每个视频的互动率并找出最大值（用于计算真实度得分）
        let maxInteractionRate = 0;
        const videoMeta = new Map(); // 存储 { ir, isLowData }
        
        validVideos.forEach(video => {
            const ir = this.calculateInteractionRate(video);
            
            // 判断是否为低数据视频
            let isLowData = false;
            let viewCount = this.parseNumber(video.stat.view);
            
            // 抖音特殊逻辑：如果播放量缺失或为0，尝试使用点赞数判断
            if ((isNaN(viewCount) || viewCount <= 0) && video.stat.like) {
                const likeCount = this.parseNumber(video.stat.like);
                // 假设2000播放量约等于50-100点赞，取保守值50
                if (isNaN(likeCount) || likeCount < 50) {
                    isLowData = true;
                }
            } else {
                // 有播放量，按标准判断
                if (isNaN(viewCount) || viewCount < 2000) {
                    isLowData = true;
                }
            }
            
            videoMeta.set(video, { ir, isLowData });
            
            // 仅当非低数据视频时，才参与最大值计算
            if (!isLowData && ir > maxInteractionRate) {
                maxInteractionRate = ir;
            }
        });
        
        // 如果没有合格的视频提供Max值，则回退到使用所有视频的最大值
        if (maxInteractionRate === 0) {
             validVideos.forEach(video => {
                 const { ir } = videoMeta.get(video);
                 if (ir > maxInteractionRate) maxInteractionRate = ir;
             });
        }
        
        this.maxInteractionRate = maxInteractionRate;

        // 为每个视频计算综合得分
        const scoredVideos = validVideos.map(video => {
            const scores = this.calculateIndicatorScores(video);
            const baseScore = this.calculateTotalScore(scores);
            
            // 计算时间衰减系数
            const timeDecay = this.calculateTimeDecay(video);
            
            // 计算真实度得分 (Log Normalization)
            // ln(1 + x) / ln(1 + max)
            const { ir, isLowData } = videoMeta.get(video);
            let realismScore = 0;
            
            if (isLowData) {
                realismScore = 0.2; // 低数据保护固定分
            } else {
                realismScore = maxInteractionRate > 0 ? (Math.log(1 + ir) / Math.log(1 + maxInteractionRate)) : 0;
            }
            
            // 应用时间衰减和真实度权重
            // Formula: (Base * 0.8 + Realism * 0.2) * TimeDecay * 100
            const totalScore = (baseScore * 0.8 + realismScore * 0.2) * timeDecay * 100;

            return {
                ...video,
                scores: scores,
                timeDecay: parseFloat(timeDecay.toFixed(4)),
                totalScore: parseFloat(totalScore.toFixed(4)),
                realismScore: parseFloat(realismScore.toFixed(4)), // 新增真实度得分
                interactionRate: parseFloat(ir.toFixed(6)), // 保留互动率供参考
                isLowData: isLowData
            };
        });
        
        // 按综合得分降序排序
        return scoredVideos.sort((a, b) => b.totalScore - a.totalScore);
    }

    /**
     * 计算视频互动率（用于真实度得分）
     * 抖音权重：点赞0.4、评论0.3、分享0.2、收藏0.1
     * @param {Object} video 视频数据
     * @returns {number} 互动率
     */
    calculateInteractionRate(video) {
        if (!video || !video.stat) return 0;
        
        // 权重配置
        const weights = {
            like: 0.4,
            reply: 0.3,
            share: 0.2,
            favorite: 0.1
        };
        
        // 计算加权互动数
        let weightedInteractions = 0;
        Object.entries(weights).forEach(([field, weight]) => {
            const val = this.parseNumber(video.stat[field]);
            if (!isNaN(val) && val > 0) {
                weightedInteractions += val * weight;
            }
        });
        
        // 分母：播放量（如果无效则用点赞数）
        let denominator = this.parseNumber(video.stat.view);
        if (isNaN(denominator) || denominator <= 0) {
            denominator = this.parseNumber(video.stat.like);
        }
        if (isNaN(denominator) || denominator <= 0) {
            denominator = 1; // 避免除以零
        }
        
        return weightedInteractions / denominator;
    }

    /**
     * 计算时间衰减系数
     * 公式：exp(-ln(2) * days / halfLife)
     * @param {Object} video 视频数据
     * @returns {number} 衰减系数 (0-1)
     */
    calculateTimeDecay(video) {
        // 抖音视频发布时间在 video.stat.time
        let timestamp = video.stat && video.stat.time ? video.stat.time : null;
        
        // 如果没有找到时间，尝试其他常见字段作为后备
        if (!timestamp) {
            timestamp = video.create_time || video.createTime || video.publish_time;
        }
        
        if (!timestamp) return 1; // 如果没有时间信息，不进行衰减
        
        // 尝试解析时间
        if (typeof timestamp === 'string' && isNaN(Number(timestamp))) {
            // 可能是日期字符串
            const parsed = Date.parse(timestamp);
            if (!isNaN(parsed)) {
                timestamp = parsed;
            } else {
                return 1; // 无法解析的时间格式
            }
        } else {
            // 是数字或数字字符串
            timestamp = Number(timestamp);
        }

        if (isNaN(timestamp)) return 1;
        
        // 统一转换为毫秒
        // 如果时间戳小于 10000000000 (10位)，认为是秒，需要乘以1000
        if (timestamp < 10000000000) {
            timestamp *= 1000;
        }
        
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        
        // 计算指数衰减
        // lambda = ln(2) / halfLife
        const lambda = Math.LN2 / this.timeDecayHalfLife;
        const decay = Math.exp(-lambda * diffDays);
        
        return decay;
    }
    
    /**
     * 解析数值（支持"1.2万"、"100w"等格式）
     * @param {string|number} value 待解析的数值
     * @returns {number} 解析后的数值，如果解析失败返回NaN
     */
    parseNumber(value) {
        if (value === undefined || value === null || value === '-') return NaN;
        if (typeof value === 'number') return value;
        
        let str = String(value).trim();
        if (str === '') return NaN;
        
        let multiplier = 1;
        if (str.endsWith('w') || str.endsWith('W') || str.endsWith('万')) {
            multiplier = 10000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('k') || str.endsWith('K')) {
            multiplier = 1000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('亿')) {
            multiplier = 100000000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('+')) {
            str = str.substring(0, str.length - 1);
        }
        
        const num = parseFloat(str);
        return isNaN(num) ? NaN : num * multiplier;
    }

    /**
     * 检查视频数据是否有效
     * @param {Object} video 视频数据
     * @returns {boolean} 是否有效
     */
    isValidVideo(video) {
        if (!video || !video.stat) return false;
        
        const requiredFields = ['reply', 'favorite', 'recommend', 'share', 'like'];
        // 至少需要其中的大多数字段有效才认为是有效视频
        let validCount = 0;
        let totalCount = requiredFields.length;
        
        requiredFields.forEach(field => {
            const value = video.stat[field];
            const num = this.parseNumber(value);
            if (!isNaN(num) && num >= 0) {
                validCount++;
            }
        });
        
        // 如果至少有一半以上的字段有效，则认为是有效视频
        return validCount >= Math.ceil(totalCount / 2);
    }
    
    /**
     * 计算所有视频的统计数据
     * @param {Array} videos 视频数组
     */
    calculateStats(videos) {
        const fields = ['reply', 'favorite', 'recommend', 'share', 'like'];
        const stats = {};
        
        fields.forEach(field => {
            // 提取所有数值
            const values = videos.map(v => this.parseNumber(v.stat[field])).filter(v => !isNaN(v));
            
            if (values.length === 0) {
                stats[field] = { min: 0, max: 0, mean: 0, std: 0, sum: 0 };
                return;
            }
            
            // 计算基本统计量
            const min = Math.min(...values);
            const max = Math.max(...values);
            const sum = values.reduce((acc, val) => acc + val, 0);
            const mean = sum / values.length;
            
            // 计算标准差
            const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
            const std = Math.sqrt(variance);
            
            stats[field] = { min, max, mean, std, sum };
        });
        
        this.stats = stats;
    }
    
    /**
     * 计算单个视频各指标的得分
     * @param {Object} video 视频数据
     * @returns {Object} 各指标得分
     */
    calculateIndicatorScores(video) {
        const scores = {};
        
        Object.keys(this.weights).forEach(field => {
            const value = this.parseNumber(video.stat[field]);
            const stat = this.stats[field];
            
            if (isNaN(value)) {
                scores[field] = 0;
                return;
            }
            
            // 根据选择的归一化方法计算得分（0-1之间）
            if (this.normalizationMethod === 0) {
                // Min-Max归一化 (使用对数优化，处理长尾分布)
                const logValue = Math.log(value + 1);
                const logMin = Math.log(stat.min + 1);
                const logMax = Math.log(stat.max + 1);
                
                scores[field] = logMax !== logMin 
                    ? (logValue - logMin) / (logMax - logMin) 
                    : 1.0; // 当所有值相同时，给予满分
            } else {
                // Z-Score标准化，然后映射到0-1区间
                const zScore = stat.std !== 0 ? (value - stat.mean) / stat.std : 0;
                // 使用Sigmoid函数将Z-Score映射到0-1
                scores[field] = 1 / (1 + Math.exp(-zScore));
            }
        });
        
        return scores;
    }
    
    /**
     * 计算综合得分
     * @param {Object} scores 各指标得分
     * @returns {number} 综合得分
     */
    calculateTotalScore(scores) {
        let total = 0;
        
        Object.keys(this.weights).forEach(field => {
            total += scores[field] * this.weights[field];
        });
        
        return total;
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
     * 生成推荐报告
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
            const coverUrl = video.pic || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            const douyinPlayLink = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #23ade5; text-decoration: none;">播放直链</a>` : '';
            
            listHtml += `
                <li style="margin: 0.8rem 0; display: flex; align-items: flex-start; gap: 1rem;">
                    <div style="width: 160px; height: 90.6px; flex-shrink: 0; border-radius: 4px; overflow: hidden;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="width: 100%; height: 100%; object-fit: cover; border: none;">
                    </div>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.1em; color: #333;">${index + 1}. ${video.title}</strong>
                        <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                            作者：${video.author} <span style="margin: 0 5px; color: #ddd;">|</span> 
                            <span style="color: #fb7299; font-weight: bold; cursor: help; border-bottom: 1px dashed #fb7299;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</span>
                        </div>
                        <div style="margin-top: 5px; font-size: 0.85em; color: #888; display: flex; flex-wrap: wrap; gap: 10px;">
                            <span>点赞：${this.formatNumber(video.stat.like)}</span>
                            <span>评论：${this.formatNumber(video.stat.reply)}</span>
                            <span>收藏：${this.formatNumber(video.stat.favorite)}</span>
                            <span>分享：${this.formatNumber(video.stat.share)}</span>
                            <span>推荐：${this.formatNumber(video.stat.recommend)}</span>
                        </div>
                        <div style="margin-top: 8px;">
                            <a href="https://www.douyin.com/video/${video.vid}" target="_blank" style="display: inline-block; padding: 4px 12px; background: #23ade5; color: white; text-decoration: none; border-radius: 4px; font-size: 0.85em;">跳转播放</a>
                            ${douyinPlayLink ? `<a href="${video.url}" target="_blank" style="display: inline-block; margin-left: 8px; padding: 4px 12px; background: #e7f5fb; color: #23ade5; text-decoration: none; border-radius: 4px; font-size: 0.85em;">播放直链</a>` : ''}
                        </div>
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
            const coverUrl = video.pic || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            
            gridHtml += `
                <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
                    <div style="position: relative; padding-top: 56.25%;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                        <span style="position: absolute; top: 0; left: 0; background: #fb7299; color: white; padding: 2px 8px; font-size: 12px; border-bottom-right-radius: 8px; font-weight: bold;">TOP ${index + 1}</span>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 20px 10px 5px; color: white; font-size: 12px;">
                            <span style="margin-right: 8px;">点赞 ${this.formatNumber(video.stat.like)}</span>
                            <span>收藏 ${this.formatNumber(video.stat.favorite)}</span>
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; font-weight: bold; margin-bottom: 8px; line-height: 1.4;">${video.title}</div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">作者：${video.author}</div>
                        <div style="font-size: 13px; color: #fb7299; font-weight: bold; margin-bottom: 8px; cursor: help;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</div>
                        <a href="https://www.douyin.com/video/${video.vid}" target="_blank" style="display: block; text-align: center; background: #f1f2f3; color: #333; text-decoration: none; padding: 6px 0; border-radius: 4px; font-size: 12px;">立即观看</a>
                    </div>
                </div>
            `;
        });
        gridHtml += `</div>`;
        
        // 组合最终报告
        let report = `
            <div class="recommendation-report" style="margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; color: #23ade5; display: inline-block; vertical-align: middle;">视频推荐结果</h3>
                        <span style="margin-left: 10px; font-size: 0.9em; color: #666;">基于综合评分（互动数据等）推荐以下最佳视频</span>
                    </div>
                    <div class="view-toggle" style="background: #e0e0e0; border-radius: 4px; padding: 2px;">
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='block';this.closest('.recommendation-report').querySelector('.grid-view').style.display='none';this.style.background='#fff';this.nextElementSibling.style.background='transparent';" style="border: none; background: #fff; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">列表</button>
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='none';this.closest('.recommendation-report').querySelector('.grid-view').style.display='grid';this.style.background='#fff';this.previousElementSibling.style.background='transparent';" style="border: none; background: transparent; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">卡片</button>
                    </div>
                </div>
                
                ${listHtml}
                ${gridHtml}
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed #ddd; font-size: 0.9rem; color: #666;">
                    <p style="margin: 0 0 8px 0;"><strong>评分模型权重说明：</strong></p>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        `;
        
        // 添加权重说明
        Object.entries(this.weights).forEach(([field, weight]) => {
            const fieldNames = {
                reply: '评论数',
                favorite: '收藏数',
                recommend: '推荐数',
                share: '分享数',
                like: '点赞数'
            };
            
            report += `<span style="background: #e7f5fb; color: #23ade5; padding: 2px 8px; border-radius: 4px;">${fieldNames[field]}: ${(weight * 100).toFixed(0)}%</span>`;
        });
        
        // 添加半衰期说明
        report += `<span style="background: #f0f0f0; color: #666; padding: 2px 8px; border-radius: 4px;">时间衰减半衰期: ${this.timeDecayHalfLife}天</span>`;
        
        report += `
                    </div>
                </div>
            </div>
        `;
        
        return report;
    }
    
    /**
     * 生成评分详情Tooltip
     * @param {Object} video 视频数据
     * @returns {string} Tooltip文本
     */
    generateTooltip(video) {
        let tooltip = `综合得分: ${video.totalScore.toFixed(4)}\n`;
        
        if (video.isLowData) {
            tooltip += `真实度得分: ${video.realismScore.toFixed(4)} (低数据保护: 播放<2000或点赞<50)\n`;
        } else {
            tooltip += `真实度得分: ${video.realismScore !== undefined ? video.realismScore.toFixed(4) : 'N/A'} (Log归一化)\n`;
        }
        
        if (video.interactionRate !== undefined && this.maxInteractionRate !== undefined) {
             tooltip += `互动率: ${video.interactionRate.toFixed(6)} / Max(有效): ${this.maxInteractionRate.toFixed(6)}\n`;
             tooltip += `(算法: 加权互动数 / 播放量(或点赞))\n`;
        }
        tooltip += `----------------\n`;
        tooltip += `公式: (基础分*0.8 + 真实度*0.2) * 时间衰减 * 100\n`;
        
        // Base score calculation
        let baseScore = 0;
        tooltip += `\n1. 基础分 (各指标加权求和):\n`;
        const fieldNames = {
            reply: '评论数', favorite: '收藏数', recommend: '推荐数', 
            share: '分享数', like: '点赞数'
        };
        
        Object.entries(this.weights).forEach(([field, weight]) => {
            const rawValue = this.formatNumber(video.stat[field]);
            const normScore = video.scores && video.scores[field] !== undefined ? video.scores[field].toFixed(4) : '0.0000';
            const contribution = (video.scores && video.scores[field] !== undefined ? video.scores[field] * weight : 0).toFixed(4);
            tooltip += `   - ${fieldNames[field] || field}: 原始[${rawValue}] -> 归一化[${normScore}] * 权重[${weight}] = ${contribution}\n`;
            if (video.scores && video.scores[field]) baseScore += video.scores[field] * weight;
        });
        
        tooltip += `   基础分合计: ${baseScore.toFixed(4)}\n`;
        
        // Time decay
        const timeDecay = video.timeDecay !== undefined ? video.timeDecay : 1;
        tooltip += `\n2. 时间衰减: ${timeDecay.toFixed(4)}\n`;
        if (timeDecay < 1) {
             tooltip += `   (半衰期: ${this.timeDecayHalfLife}天)\n`;
        }
        
        tooltip += `\n计算: (${baseScore.toFixed(4)}*0.8 + ${video.realismScore.toFixed(4)}*0.2) * ${timeDecay.toFixed(4)} * 100 = ${video.totalScore.toFixed(4)}`;
        
        return tooltip;
    }
    
    /**
     * 数字格式化（添加千位分隔符）
     * @param {number} num 数字
     * @returns {string} 格式化后的数字字符串
     */
    formatNumber(num) {
        if (num === undefined || num === null || num === '-') {
            return '-';
        }
        if (typeof num === 'string' && isNaN(num)) {
            return num;
        }
        return parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
}

class VideoKuaishouRecommender {
    /**
     * 初始化推荐器
     * @param {Object} options 配置参数
     * @param {Object} options.weights 各指标权重配置，默认：{view: 0.1, like: 0.3, comment: 0.3, share: 0.3}
     * @param {number} options.normalizationMethod 归一化方法 0:min-max 1:z-score，默认0
     */
    constructor(options = {}) {
        this.weights = options.weights || {
            view: 0.1,       // 播放量权重
            like: 0.3,       // 点赞数权重
            comment: 0.3,    // 评论数权重
            share: 0.3       // 分享数权重
        };
        
        // 归一化方法，默认使用min-max
        this.normalizationMethod = options.normalizationMethod || 0;
        
        // 时间衰减半衰期（天），默认365天
        this.timeDecayHalfLife = options.timeDecayHalfLife || 365;
        
        // 缓存统计数据
        this.stats = null;
        this.maxInteractionRate = 0;
    }
    
    /**
     * 计算视频的综合得分并排序
     * @param {Array} videos 视频数据数组
     * @returns {Array} 带综合得分并排序的视频数组
     */
    recommend(videos) {
        if (!videos || videos.length === 0) {
            return [];
        }
        
        // 过滤掉数据不完整的视频
        const validVideos = videos.filter(video => this.isValidVideo(video));
        
        if (validVideos.length === 0) {
            return [];
        }
        
        // 计算统计数据（最大值、最小值、平均值、标准差）
        this.calculateStats(validVideos);
        
        // 1. 计算每个视频的互动率并找出最大值（用于计算真实度得分）
        let maxInteractionRate = 0;
        const videoMeta = new Map(); // 存储 { ir, isLowData }
        
        validVideos.forEach(video => {
            const ir = this.calculateInteractionRate(video);
            
            // 判断是否为低数据视频 (播放量 < 2000)
            let isLowData = false;
            let viewCount = this.parseNumber(video.stat.view);
            if (isNaN(viewCount) || viewCount < 2000) {
                isLowData = true;
            }
            
            videoMeta.set(video, { ir, isLowData });
            
            // 仅当非低数据视频时，才参与最大值计算
            if (!isLowData && ir > maxInteractionRate) {
                maxInteractionRate = ir;
            }
        });
        
        // 如果没有合格的视频提供Max值，则回退到使用所有视频的最大值
        if (maxInteractionRate === 0) {
             validVideos.forEach(video => {
                 const { ir } = videoMeta.get(video);
                 if (ir > maxInteractionRate) maxInteractionRate = ir;
             });
        }
        
        this.maxInteractionRate = maxInteractionRate;

        // 为每个视频计算综合得分
        const scoredVideos = validVideos.map(video => {
            const scores = this.calculateIndicatorScores(video);
            const baseScore = this.calculateTotalScore(scores);
            
            // 计算时间衰减系数
            const timeDecay = this.calculateTimeDecay(video);
            
            // 计算真实度得分 (Log Normalization)
            // ln(1 + x) / ln(1 + max)
            const { ir, isLowData } = videoMeta.get(video);
            let realismScore = 0;
            
            if (isLowData) {
                realismScore = 0.2; // 低数据保护固定分
            } else {
                realismScore = maxInteractionRate > 0 ? (Math.log(1 + ir) / Math.log(1 + maxInteractionRate)) : 0;
            }
            
            // 应用时间衰减和真实度权重
            // Formula: (Base * 0.8 + Realism * 0.2) * TimeDecay * 100
            const totalScore = (baseScore * 0.8 + realismScore * 0.2) * timeDecay * 100;

            return {
                ...video,
                scores: scores,
                timeDecay: parseFloat(timeDecay.toFixed(4)),
                totalScore: parseFloat(totalScore.toFixed(4)),
                realismScore: parseFloat(realismScore.toFixed(4)), // 新增真实度得分
                interactionRate: parseFloat(ir.toFixed(6)), // 保留互动率供参考
                isLowData: isLowData
            };
        });
        
        // 按综合得分降序排序
        return scoredVideos.sort((a, b) => b.totalScore - a.totalScore);
    }

    /**
     * 计算视频互动率（用于真实度得分）
     * 快手权重：收藏0.35、评论0.3、点赞0.25、分享0.1
     * @param {Object} video 视频数据
     * @returns {number} 互动率
     */
    calculateInteractionRate(video) {
        if (!video || !video.stat) return 0;
        
        // 权重配置
        const weights = {
            favorite: 0.35,
            comment: 0.3,
            like: 0.25,
            share: 0.1
        };
        
        // 计算加权互动数
        let weightedInteractions = 0;
        Object.entries(weights).forEach(([field, weight]) => {
            const val = this.parseNumber(video.stat[field]);
            if (!isNaN(val) && val > 0) {
                weightedInteractions += val * weight;
            }
        });
        
        // 分母：播放量（如果无效则用点赞数）
        let denominator = this.parseNumber(video.stat.view);
        if (isNaN(denominator) || denominator <= 0) {
            denominator = this.parseNumber(video.stat.like);
        }
        if (isNaN(denominator) || denominator <= 0) {
            denominator = 1; // 避免除以零
        }
        
        return weightedInteractions / denominator;
    }

    /**
     * 计算时间衰减系数
     * 公式：exp(-ln(2) * days / halfLife)
     * @param {Object} video 视频数据
     * @returns {number} 衰减系数 (0-1)
     */
    calculateTimeDecay(video) {
        // 快手视频发布时间在 video.createTime
        let timestamp = video.createTime;
        
        // 如果没有找到时间，尝试其他常见字段作为后备
        if (!timestamp) {
            timestamp = (video.stat && video.stat.time) || video.created || video.create_time;
        }
        
        if (!timestamp) return 1; // 如果没有时间信息，不进行衰减
        
        // 尝试解析时间
        if (typeof timestamp === 'string' && isNaN(Number(timestamp))) {
            // 可能是日期字符串
            const parsed = Date.parse(timestamp);
            if (!isNaN(parsed)) {
                timestamp = parsed;
            } else {
                return 1; // 无法解析的时间格式
            }
        } else {
            // 是数字或数字字符串
            timestamp = Number(timestamp);
        }

        if (isNaN(timestamp)) return 1;
        
        // 统一转换为毫秒
        // 如果时间戳小于 10000000000 (10位)，认为是秒，需要乘以1000
        if (timestamp < 10000000000) {
            timestamp *= 1000;
        }
        
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        
        // 计算指数衰减
        // lambda = ln(2) / halfLife
        const lambda = Math.LN2 / this.timeDecayHalfLife;
        const decay = Math.exp(-lambda * diffDays);
        
        return decay;
    }
    
    /**
     * 解析数值（支持"1.2万"、"100w"等格式）
     * @param {string|number} value 待解析的数值
     * @returns {number} 解析后的数值，如果解析失败返回NaN
     */
    parseNumber(value) {
        if (value === undefined || value === null || value === '-') return NaN;
        if (typeof value === 'number') return value;
        
        let str = String(value).trim();
        if (str === '') return NaN;
        
        let multiplier = 1;
        if (str.endsWith('w') || str.endsWith('W') || str.endsWith('万')) {
            multiplier = 10000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('k') || str.endsWith('K')) {
            multiplier = 1000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('亿')) {
            multiplier = 100000000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('+')) {
            str = str.substring(0, str.length - 1);
        }
        
        const num = parseFloat(str);
        return isNaN(num) ? NaN : num * multiplier;
    }

    /**
     * 检查视频数据是否有效
     * @param {Object} video 视频数据
     * @returns {boolean} 是否有效
     */
    isValidVideo(video) {
        if (!video || !video.stat) return false;
        
        const requiredFields = ['view', 'like', 'comment', 'share'];
        // 至少需要其中的大多数字段有效才认为是有效视频
        let validCount = 0;
        let totalCount = requiredFields.length;
        
        requiredFields.forEach(field => {
            const value = video.stat[field];
            const num = this.parseNumber(value);
            if (!isNaN(num) && num >= 0) {
                validCount++;
            }
        });
        
        // 如果至少有一半以上的字段有效，则认为是有效视频
        return validCount >= Math.ceil(totalCount / 2);
    }
    
    /**
     * 计算所有视频的统计数据
     * @param {Array} videos 视频数组
     */
    calculateStats(videos) {
        const fields = ['view', 'like', 'comment', 'share'];
        const stats = {};
        
        fields.forEach(field => {
            // 提取所有数值
            const values = videos.map(v => this.parseNumber(v.stat[field])).filter(v => !isNaN(v));
            
            if (values.length === 0) {
                stats[field] = { min: 0, max: 0, mean: 0, std: 0, sum: 0 };
                return;
            }
            
            // 计算基本统计量
            const min = Math.min(...values);
            const max = Math.max(...values);
            const sum = values.reduce((acc, val) => acc + val, 0);
            const mean = sum / values.length;
            
            // 计算标准差
            const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
            const std = Math.sqrt(variance);
            
            stats[field] = { min, max, mean, std, sum };
        });
        
        this.stats = stats;
    }
    
    /**
     * 计算单个视频各指标的得分
     * @param {Object} video 视频数据
     * @returns {Object} 各指标得分
     */
    calculateIndicatorScores(video) {
        const scores = {};
        
        Object.keys(this.weights).forEach(field => {
            const value = this.parseNumber(video.stat[field]);
            const stat = this.stats[field];
            
            if (isNaN(value)) {
                scores[field] = 0;
                return;
            }
            
            // 根据选择的归一化方法计算得分（0-1之间）
            if (this.normalizationMethod === 0) {
                // Min-Max归一化 (使用对数优化，处理长尾分布)
                const logValue = Math.log(value + 1);
                const logMin = Math.log(stat.min + 1);
                const logMax = Math.log(stat.max + 1);
                
                scores[field] = logMax !== logMin 
                    ? (logValue - logMin) / (logMax - logMin) 
                    : 1.0; // 当所有值相同时，给予满分
            } else {
                // Z-Score标准化，然后映射到0-1区间
                const zScore = stat.std !== 0 ? (value - stat.mean) / stat.std : 0;
                // 使用Sigmoid函数将Z-Score映射到0-1
                scores[field] = 1 / (1 + Math.exp(-zScore));
            }
        });
        
        return scores;
    }
    
    /**
     * 计算综合得分
     * @param {Object} scores 各指标得分
     * @returns {number} 综合得分
     */
    calculateTotalScore(scores) {
        let total = 0;
        
        Object.keys(this.weights).forEach(field => {
            total += scores[field] * this.weights[field];
        });
        
        return total;
    }
    
    /**
     * 生成评分详情Tooltip
     * @param {Object} video 视频数据
     * @returns {string} Tooltip文本
     */
    generateTooltip(video) {
        let tooltip = `综合得分: ${video.totalScore.toFixed(4)}\n`;
        
        if (video.isLowData) {
            tooltip += `真实度得分: ${video.realismScore.toFixed(4)} (低数据保护: 播放<2000)\n`;
        } else {
            tooltip += `真实度得分: ${video.realismScore !== undefined ? video.realismScore.toFixed(4) : 'N/A'} (Log归一化)\n`;
        }
        
        if (video.interactionRate !== undefined && this.maxInteractionRate !== undefined) {
             tooltip += `互动率: ${video.interactionRate.toFixed(6)} / Max(有效): ${this.maxInteractionRate.toFixed(6)}\n`;
             tooltip += `(算法: 加权互动数 / 播放量)\n`;
        }
        tooltip += `----------------\n`;
        tooltip += `公式: (基础分*0.8 + 真实度*0.2) * 时间衰减 * 100\n`;
        
        // Base score calculation
        let baseScore = 0;
        tooltip += `\n1. 基础分 (各指标加权求和):\n`;
        const fieldNames = {
            view: '播放量', like: '点赞数', comment: '评论数', share: '分享数'
        };
        
        Object.entries(this.weights).forEach(([field, weight]) => {
            const rawValue = this.formatNumber(video.stat[field]);
            const normScore = video.scores && video.scores[field] !== undefined ? video.scores[field].toFixed(4) : '0.0000';
            const contribution = (video.scores && video.scores[field] !== undefined ? video.scores[field] * weight : 0).toFixed(4);
            tooltip += `   - ${fieldNames[field] || field}: 原始[${rawValue}] -> 归一化[${normScore}] * 权重[${weight}] = ${contribution}\n`;
            if (video.scores && video.scores[field]) baseScore += video.scores[field] * weight;
        });
        
        tooltip += `   基础分合计: ${baseScore.toFixed(4)}\n`;
        
        // Time decay
        const timeDecay = video.timeDecay !== undefined ? video.timeDecay : 1;
        tooltip += `\n2. 时间衰减: ${timeDecay.toFixed(4)}\n`;
        if (timeDecay < 1) {
             tooltip += `   (半衰期: ${this.timeDecayHalfLife}天)\n`;
        }
        
        tooltip += `\n计算: (${baseScore.toFixed(4)}*0.8 + ${video.realismScore.toFixed(4)}*0.2) * ${timeDecay.toFixed(4)} * 100 = ${video.totalScore.toFixed(4)}`;
        
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
     * 生成推荐报告
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
            const coverUrl = video.pic || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            const playLink = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #ff5000; text-decoration: none;">播放直链</a>` : '';
            
            listHtml += `
                <li style="margin: 0.8rem 0; display: flex; align-items: flex-start; gap: 1rem;">
                    <div style="width: 160px; height: 90.6px; flex-shrink: 0; border-radius: 4px; overflow: hidden;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="width: 100%; height: 100%; object-fit: cover; border: none;">
                    </div>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.1em; color: #333;">${index + 1}. ${video.title}</strong>
                        <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                            作者：${video.author} <span style="margin: 0 5px; color: #ddd;">|</span> 
                            <span style="color: #ff5000; font-weight: bold; cursor: help; border-bottom: 1px dashed #ff5000;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</span>
                        </div>
                        <div style="margin-top: 5px; font-size: 0.85em; color: #888; display: flex; flex-wrap: wrap; gap: 10px;">
                            <span>播放：${this.formatNumber(video.stat.view)}</span>
                            <span>点赞：${this.formatNumber(video.stat.like)}</span>
                            <span>评论：${this.formatNumber(video.stat.comment)}</span>
                            <span>分享：${this.formatNumber(video.stat.share)}</span>
                        </div>
                        <div style="margin-top: 8px;">
                            <a href="https://v.kuaishou.com/${video.vid || '#'}" target="_blank" style="display: inline-block; padding: 4px 12px; background: #ff5000; color: white; text-decoration: none; border-radius: 4px; font-size: 0.85em;">跳转播放</a>
                            ${playLink ? `<a href="${video.url}" target="_blank" style="display: inline-block; margin-left: 8px; padding: 4px 12px; background: #fff3e0; color: #ff5000; text-decoration: none; border-radius: 4px; font-size: 0.85em;">播放直链</a>` : ''}
                        </div>
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
            const coverUrl = video.pic || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            
            gridHtml += `
                <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
                    <div style="position: relative; padding-top: 56.25%;">
                        <img src="${coverUrl}" alt="${video.title}封面" 
                             style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                        <span style="position: absolute; top: 0; left: 0; background: #ff5000; color: white; padding: 2px 8px; font-size: 12px; border-bottom-right-radius: 8px; font-weight: bold;">TOP ${index + 1}</span>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 20px 10px 5px; color: white; font-size: 12px;">
                            <span style="margin-right: 8px;">播放 ${this.formatNumber(video.stat.view)}</span>
                            <span>点赞 ${this.formatNumber(video.stat.like)}</span>
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; font-weight: bold; margin-bottom: 8px; line-height: 1.4;">${video.title}</div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">作者：${video.author}</div>
                        <div style="font-size: 13px; color: #ff5000; font-weight: bold; margin-bottom: 8px; cursor: help;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</div>
                        <a href="https://v.kuaishou.com/${video.vid || '#'}" target="_blank" style="display: block; text-align: center; background: #f1f2f3; color: #333; text-decoration: none; padding: 6px 0; border-radius: 4px; font-size: 12px;">立即观看</a>
                    </div>
                </div>
            `;
        });
        gridHtml += `</div>`;
        
        // 组合最终报告
        let report = `
            <div class="recommendation-report" style="margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; color: #ff5000; display: inline-block; vertical-align: middle;">快手视频推荐结果</h3>
                        <span style="margin-left: 10px; font-size: 0.9em; color: #666;">基于综合评分（播放、互动数据等）推荐以下最佳视频</span>
                    </div>
                    <div class="view-toggle" style="background: #e0e0e0; border-radius: 4px; padding: 2px;">
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='block';this.closest('.recommendation-report').querySelector('.grid-view').style.display='none';this.style.background='#fff';this.nextElementSibling.style.background='transparent';" style="border: none; background: #fff; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">列表</button>
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='none';this.closest('.recommendation-report').querySelector('.grid-view').style.display='grid';this.style.background='#fff';this.previousElementSibling.style.background='transparent';" style="border: none; background: transparent; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">卡片</button>
                    </div>
                </div>
                
                ${listHtml}
                ${gridHtml}
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed #ddd; font-size: 0.9rem; color: #666;">
                    <p style="margin: 0 0 8px 0;"><strong>评分模型权重说明：</strong></p>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        `;
        
        // 添加权重说明
        Object.entries(this.weights).forEach(([field, weight]) => {
            const fieldNames = {
                view: '播放量',
                like: '点赞数',
                comment: '评论数',
                share: '分享数'
            };
            
            report += `<span style="background: #fff3e0; color: #ff5000; padding: 2px 8px; border-radius: 4px;">${fieldNames[field]}: ${(weight * 100).toFixed(0)}%</span>`;
        });
        
        // 添加半衰期说明
        report += `<span style="background: #f0f0f0; color: #666; padding: 2px 8px; border-radius: 4px;">时间衰减半衰期: ${this.timeDecayHalfLife}天</span>`;
        
        report += `
                    </div>
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
        if (num === undefined || num === null || num === '-') {
            return '-';
        }
        if (typeof num === 'string' && isNaN(num)) {
            return num;
        }
        return parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
}

class VideoXiaohongshuRecommender {
    /**
     * 初始化推荐器
     * @param {Object} options 配置参数
     * @param {Object} options.weights 各指标权重配置，默认：{like: 0.4, comment: 0.3, share: 0.3}
     * @param {number} options.normalizationMethod 归一化方法 0:min-max 1:z-score，默认0
     */
    constructor(options = {}) {
        this.weights = options.weights || {
            like: 0.4,       // 点赞数权重
            comment: 0.3,    // 评论数权重
            share: 0.3       // 分享数权重
        };
        
        // 归一化方法，默认使用min-max
        this.normalizationMethod = options.normalizationMethod || 0;
        
        // 时间衰减半衰期（天），默认365天
        this.timeDecayHalfLife = options.timeDecayHalfLife || 365;
        
        // 缓存统计数据
        this.stats = null;
        this.maxInteractionRate = 0;
    }
    
    /**
     * 计算视频的综合得分并排序
     * @param {Array} videos 视频数据数组
     * @returns {Array} 带综合得分并排序的视频数组
     */
    recommend(videos) {
        if (!videos || videos.length === 0) {
            return [];
        }
        
        // 过滤掉数据不完整的视频
        const validVideos = videos.filter(video => this.isValidVideo(video));
        
        if (validVideos.length === 0) {
            return [];
        }
        
        // 计算统计数据（最大值、最小值、平均值、标准差）
        this.calculateStats(validVideos);
        
        // 1. 计算每个视频的互动率并找出最大值（用于计算真实度得分）
        let maxInteractionRate = 0;
        const videoMeta = new Map(); // 存储 { ir, isLowData }
        
        validVideos.forEach(video => {
            const ir = this.calculateInteractionRate(video);
            
            // 判断是否为低数据视频
            let isLowData = false;
            // 小红书没有播放量，使用点赞数作为数据量判断
            let likeCount = this.parseNumber(video.stat.like);
            
            // 假设50点赞作为阈值
            if (isNaN(likeCount) || likeCount < 50) {
                isLowData = true;
            }
            
            videoMeta.set(video, { ir, isLowData });
            
            // 仅当非低数据视频时，才参与最大值计算
            if (!isLowData && ir > maxInteractionRate) {
                maxInteractionRate = ir;
            }
        });
        
        // 如果没有合格的视频提供Max值，则回退到使用所有视频的最大值
        if (maxInteractionRate === 0) {
             validVideos.forEach(video => {
                 const { ir } = videoMeta.get(video);
                 if (ir > maxInteractionRate) maxInteractionRate = ir;
             });
        }
        
        this.maxInteractionRate = maxInteractionRate;

        // 为每个视频计算综合得分
        const scoredVideos = validVideos.map(video => {
            const scores = this.calculateIndicatorScores(video);
            const baseScore = this.calculateTotalScore(scores);
            
            // 计算时间衰减系数
            const timeDecay = this.calculateTimeDecay(video);
            
            // 计算真实度得分 (Log Normalization)
            // ln(1 + x) / ln(1 + max)
            const { ir, isLowData } = videoMeta.get(video);
            let realismScore = 0;
            
            if (isLowData) {
                realismScore = 0.2; // 低数据保护固定分
            } else {
                realismScore = maxInteractionRate > 0 ? (Math.log(1 + ir) / Math.log(1 + maxInteractionRate)) : 0;
            }
            
            // 应用时间衰减和真实度权重
            // Formula: (Base * 0.8 + Realism * 0.2) * TimeDecay * 100
            const totalScore = (baseScore * 0.8 + realismScore * 0.2) * timeDecay * 100;

            return {
                ...video,
                scores: scores,
                timeDecay: parseFloat(timeDecay.toFixed(4)),
                totalScore: parseFloat(totalScore.toFixed(4)),
                realismScore: parseFloat(realismScore.toFixed(4)), // 新增真实度得分
                interactionRate: parseFloat(ir.toFixed(6)), // 保留互动率供参考
                isLowData: isLowData
            };
        });
        
        // 按综合得分降序排序
        return scoredVideos.sort((a, b) => b.totalScore - a.totalScore);
    }

    /**
     * 计算视频互动率（用于真实度得分）
     * 小红书权重：评论0.6、分享0.4
     * @param {Object} video 视频数据
     * @returns {number} 互动率
     */
    calculateInteractionRate(video) {
        if (!video || !video.stat) return 0;
        
        // 权重配置
        const weights = {
            comment: 0.6,
            share: 0.4
        };
        
        // 计算加权互动数
        let weightedInteractions = 0;
        Object.entries(weights).forEach(([field, weight]) => {
            const val = this.parseNumber(video.stat[field]);
            if (!isNaN(val) && val > 0) {
                weightedInteractions += val * weight;
            }
        });
        
        // 分母：使用点赞数作为基数（因为没有播放量）
        let denominator = this.parseNumber(video.stat.like);
        if (isNaN(denominator) || denominator <= 0) {
            denominator = 1; // 避免除以零
        }
        
        return weightedInteractions / denominator;
    }

    /**
     * 计算时间衰减系数
     * 公式：exp(-ln(2) * days / halfLife)
     * @param {Object} video 视频数据
     * @returns {number} 衰减系数 (0-1)
     */
    calculateTimeDecay(video) {
        // 小红书视频发布时间
        let timestamp = video.createTime;
        
        // 如果没有找到时间，尝试其他常见字段作为后备
        if (!timestamp) {
             timestamp = (video.stat && video.stat.time) || video.created || video.create_time;
        }

        if (!timestamp) return 1; // 如果没有时间信息，不进行衰减
        
        // 尝试解析时间
        if (typeof timestamp === 'string' && isNaN(Number(timestamp))) {
            // 可能是日期字符串
            const parsed = Date.parse(timestamp);
            if (!isNaN(parsed)) {
                timestamp = parsed;
            } else {
                return 1; // 无法解析的时间格式
            }
        } else {
            // 是数字或数字字符串
            timestamp = Number(timestamp);
        }

        if (isNaN(timestamp)) return 1;
        
        // 统一转换为毫秒
        // 如果时间戳小于 10000000000 (10位)，认为是秒，需要乘以1000
        if (timestamp < 10000000000) {
            timestamp *= 1000;
        }
        
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffDays = Math.max(0, diffMs / (1000 * 60 * 60 * 24));
        
        // 计算指数衰减
        // lambda = ln(2) / halfLife
        const lambda = Math.LN2 / this.timeDecayHalfLife;
        const decay = Math.exp(-lambda * diffDays);
        
        return decay;
    }
    
    /**
     * 解析数值（支持"1.2万"、"100w"等格式）
     * @param {string|number} value 待解析的数值
     * @returns {number} 解析后的数值，如果解析失败返回NaN
     */
    parseNumber(value) {
        if (value === undefined || value === null || value === '-') return NaN;
        if (typeof value === 'number') return value;
        
        let str = String(value).trim();
        if (str === '') return NaN;
        
        let multiplier = 1;
        if (str.endsWith('w') || str.endsWith('W') || str.endsWith('万')) {
            multiplier = 10000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('k') || str.endsWith('K')) {
            multiplier = 1000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('亿')) {
            multiplier = 100000000;
            str = str.substring(0, str.length - 1);
        } else if (str.endsWith('+')) {
            str = str.substring(0, str.length - 1);
        }
        
        const num = parseFloat(str);
        return isNaN(num) ? NaN : num * multiplier;
    }

    /**
     * 检查视频数据是否有效
     * @param {Object} video 视频数据
     * @returns {boolean} 是否有效
     */
    isValidVideo(video) {
        if (!video || !video.stat) return false;
        
        const requiredFields = ['like', 'comment', 'share'];
        // 至少需要其中的大多数字段有效才认为是有效视频
        let validCount = 0;
        let totalCount = requiredFields.length;
        
        requiredFields.forEach(field => {
            const value = video.stat[field];
            const num = this.parseNumber(value);
            if (!isNaN(num) && num >= 0) {
                validCount++;
            }
        });
        
        // 如果至少有一半以上的字段有效，则认为是有效视频
        return validCount >= Math.ceil(totalCount / 2);
    }
    
    /**
     * 计算所有视频的统计数据
     * @param {Array} videos 视频数组
     */
    calculateStats(videos) {
        const fields = ['like', 'comment', 'share'];
        const stats = {};
        
        fields.forEach(field => {
            // 提取所有数值
            const values = videos.map(v => this.parseNumber(v.stat[field])).filter(v => !isNaN(v));
            
            if (values.length === 0) {
                stats[field] = { min: 0, max: 0, mean: 0, std: 0, sum: 0 };
                return;
            }
            
            // 计算基本统计量
            const min = Math.min(...values);
            const max = Math.max(...values);
            const sum = values.reduce((acc, val) => acc + val, 0);
            const mean = sum / values.length;
            
            // 计算标准差
            const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
            const std = Math.sqrt(variance);
            
            stats[field] = { min, max, mean, std, sum };
        });
        
        this.stats = stats;
    }
    
    /**
     * 计算单个视频各指标的得分
     * @param {Object} video 视频数据
     * @returns {Object} 各指标得分
     */
    calculateIndicatorScores(video) {
        const scores = {};
        
        Object.keys(this.weights).forEach(field => {
            const value = this.parseNumber(video.stat[field]);
            const stat = this.stats[field];
            
            if (isNaN(value)) {
                scores[field] = 0;
                return;
            }
            
            // 根据选择的归一化方法计算得分（0-1之间）
            if (this.normalizationMethod === 0) {
                // Min-Max归一化 (使用对数优化，处理长尾分布)
                const logValue = Math.log(value + 1);
                const logMin = Math.log(stat.min + 1);
                const logMax = Math.log(stat.max + 1);
                
                scores[field] = logMax !== logMin 
                    ? (logValue - logMin) / (logMax - logMin) 
                    : 1.0; // 当所有值相同时，给予满分
            } else {
                // Z-Score标准化，然后映射到0-1区间
                const zScore = stat.std !== 0 ? (value - stat.mean) / stat.std : 0;
                // 使用Sigmoid函数将Z-Score映射到0-1
                scores[field] = 1 / (1 + Math.exp(-zScore));
            }
        });
        
        return scores;
    }
    
    /**
     * 计算综合得分
     * @param {Object} scores 各指标得分
     * @returns {number} 综合得分
     */
    calculateTotalScore(scores) {
        let total = 0;
        
        Object.keys(this.weights).forEach(field => {
            total += scores[field] * this.weights[field];
        });
        
        return total;
    }
    
    /**
     * 生成评分详情Tooltip
     * @param {Object} video 视频数据
     * @returns {string} Tooltip文本
     */
    generateTooltip(video) {
        let tooltip = `综合得分: ${video.totalScore.toFixed(4)}\n`;
        
        if (video.isLowData) {
            tooltip += `真实度得分: ${video.realismScore.toFixed(4)} (低数据保护: 点赞<50)\n`;
        } else {
            tooltip += `真实度得分: ${video.realismScore !== undefined ? video.realismScore.toFixed(4) : 'N/A'} (Log归一化)\n`;
        }
        
        if (video.interactionRate !== undefined && this.maxInteractionRate !== undefined) {
             tooltip += `互动率: ${video.interactionRate.toFixed(6)} / Max(有效): ${this.maxInteractionRate.toFixed(6)}\n`;
             tooltip += `(算法: 加权互动数 / 点赞数)\n`;
        }
        tooltip += `----------------\n`;
        tooltip += `公式: (基础分*0.8 + 真实度*0.2) * 时间衰减 * 100\n`;
        
        // Base score calculation
        let baseScore = 0;
        tooltip += `\n1. 基础分 (各指标加权求和):\n`;
        const fieldNames = {
            like: '点赞数', comment: '评论数', share: '分享数'
        };
        
        Object.entries(this.weights).forEach(([field, weight]) => {
            const rawValue = this.formatNumber(video.stat[field]);
            const normScore = video.scores && video.scores[field] !== undefined ? video.scores[field].toFixed(4) : '0.0000';
            const contribution = (video.scores && video.scores[field] !== undefined ? video.scores[field] * weight : 0).toFixed(4);
            tooltip += `   - ${fieldNames[field] || field}: 原始[${rawValue}] -> 归一化[${normScore}] * 权重[${weight}] = ${contribution}\n`;
            if (video.scores && video.scores[field]) baseScore += video.scores[field] * weight;
        });
        
        tooltip += `   基础分合计: ${baseScore.toFixed(4)}\n`;
        
        // Time decay
        const timeDecay = video.timeDecay !== undefined ? video.timeDecay : 1;
        tooltip += `\n2. 时间衰减: ${timeDecay.toFixed(4)}\n`;
        if (timeDecay < 1) {
             tooltip += `   (半衰期: ${this.timeDecayHalfLife}天)\n`;
        }
        
        tooltip += `\n计算: (${baseScore.toFixed(4)}*0.8 + ${video.realismScore.toFixed(4)}*0.2) * ${timeDecay.toFixed(4)} * 100 = ${video.totalScore.toFixed(4)}`;
        
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
     * 生成推荐报告
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
            const title = video.title || (video.video && video.video.title) || '未知标题';
            const author = video.author || (video.owner && video.owner.name) || '未知作者';
            let coverUrl = video.pic || video.cover || (video.video && video.video.cover) || (video.video && video.video.fm) || video.fm || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            
            // 解决Mixed Content和防盗链问题
            if (coverUrl.startsWith('http')) {
                coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
            }
            
            const playLink = video.url ? ` | <a href="${video.url}" target="_blank" style="color: #ff2442; text-decoration: none;">播放直链</a>` : '';
            
            listHtml += `
                <li style="margin: 0.8rem 0; display: flex; align-items: flex-start; gap: 1rem;">
                    <div style="width: 160px; height: 90.6px; flex-shrink: 0; border-radius: 4px; overflow: hidden;">
                        <img src="${coverUrl}" alt="${title}封面" 
                             style="width: 100%; height: 100%; object-fit: cover; border: none;">
                    </div>
                    <div style="flex: 1;">
                        <strong style="font-size: 1.1em; color: #333;">${index + 1}. ${title}</strong>
                        <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
                            作者：${author} <span style="margin: 0 5px; color: #ddd;">|</span> 
                            <span style="color: #ff2442; font-weight: bold; cursor: help; border-bottom: 1px dashed #ff2442;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</span>
                        </div>
                        <div style="margin-top: 5px; font-size: 0.85em; color: #888; display: flex; flex-wrap: wrap; gap: 10px;">
                            <span>点赞：${this.formatNumber(video.stat.like)}</span>
                            <span>评论：${this.formatNumber(video.stat.comment)}</span>
                            <span>分享：${this.formatNumber(video.stat.share)}</span>
                            <span>收藏：${this.formatNumber(video.stat.favorite)}</span>
                        </div>
                        <div style="margin-top: 8px;">
                            <a href="${video.url || '#'}" target="_blank" style="display: inline-block; padding: 4px 12px; background: #ff2442; color: white; text-decoration: none; border-radius: 4px; font-size: 0.85em;">跳转播放</a>
                            ${playLink ? `<a href="${video.url}" target="_blank" style="display: inline-block; margin-left: 8px; padding: 4px 12px; background: #ffebee; color: #ff2442; text-decoration: none; border-radius: 4px; font-size: 0.85em;">播放直链</a>` : ''}
                        </div>
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
            const title = video.title || (video.video && video.video.title) || '未知标题';
            const author = video.author || (video.owner && video.owner.name) || '未知作者';
            let coverUrl = video.pic || video.cover || (video.video && video.video.cover) || (video.video && video.video.fm) || video.fm || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gMm7AAAAABJRU5ErkJggg==';
            
            // 解决Mixed Content和防盗链问题
            if (coverUrl.startsWith('http')) {
                coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
            }
            
            gridHtml += `
                <div style="background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
                    <div style="position: relative; padding-top: 56.25%;">
                        <img src="${coverUrl}" alt="${title}封面" 
                             style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
                        <span style="position: absolute; top: 0; left: 0; background: #ff2442; color: white; padding: 2px 8px; font-size: 12px; border-bottom-right-radius: 8px; font-weight: bold;">TOP ${index + 1}</span>
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.7)); padding: 20px 10px 5px; color: white; font-size: 12px;">
                            <span style="margin-right: 8px;">点赞 ${this.formatNumber(video.stat.like)}</span>
                            <span>收藏 ${this.formatNumber(video.stat.favorite)}</span>
                        </div>
                    </div>
                    <div style="padding: 10px;">
                        <div style="height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 14px; font-weight: bold; margin-bottom: 8px; line-height: 1.4;">${title}</div>
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">作者：${author}</div>
                        <div style="font-size: 13px; color: #ff2442; font-weight: bold; margin-bottom: 8px; cursor: help;" title="${this.generateTooltip(video)}">综合得分：${video.totalScore.toFixed(4)}</div>
                        <a href="${video.url || '#'}" target="_blank" style="display: block; text-align: center; background: #f1f2f3; color: #333; text-decoration: none; padding: 6px 0; border-radius: 4px; font-size: 12px;">立即观看</a>
                    </div>
                </div>
            `;
        });
        gridHtml += `</div>`;
        
        // 组合最终报告
        let report = `
            <div class="recommendation-report" style="margin-top: 1.5rem; padding: 1.5rem; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <h3 style="margin: 0; color: #ff2442; display: inline-block; vertical-align: middle;">小红书视频推荐结果</h3>
                        <span style="margin-left: 10px; font-size: 0.9em; color: #666;">基于综合评分（点赞、互动数据等）推荐以下最佳视频</span>
                    </div>
                    <div class="view-toggle" style="background: #e0e0e0; border-radius: 4px; padding: 2px;">
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='block';this.closest('.recommendation-report').querySelector('.grid-view').style.display='none';this.style.background='#fff';this.nextElementSibling.style.background='transparent';" style="border: none; background: #fff; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">列表</button>
                        <button onclick="this.closest('.recommendation-report').querySelector('.list-view').style.display='none';this.closest('.recommendation-report').querySelector('.grid-view').style.display='grid';this.style.background='#fff';this.previousElementSibling.style.background='transparent';" style="border: none; background: transparent; padding: 4px 12px; border-radius: 3px; cursor: pointer; color: #333;">卡片</button>
                    </div>
                </div>
                
                ${listHtml}
                ${gridHtml}
                
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed #ddd; font-size: 0.9rem; color: #666;">
                    <p style="margin: 0 0 8px 0;"><strong>评分模型权重说明：</strong></p>
                    <div style="display: flex; flex-wrap: wrap; gap: 15px;">
        `;
        
        // 添加权重说明
        Object.entries(this.weights).forEach(([field, weight]) => {
            const fieldNames = {
                like: '点赞数',
                comment: '评论数',
                share: '分享数'
            };
            
            report += `<span style="background: #ffebee; color: #ff2442; padding: 2px 8px; border-radius: 4px;">${fieldNames[field]}: ${(weight * 100).toFixed(0)}%</span>`;
        });
        
        // 添加半衰期说明
        report += `<span style="background: #f0f0f0; color: #666; padding: 2px 8px; border-radius: 4px;">时间衰减半衰期: ${this.timeDecayHalfLife}天</span>`;
        
        report += `
                    </div>
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
        if (num === undefined || num === null || num === '-') {
            return '-';
        }
        if (typeof num === 'string' && isNaN(num)) {
            return num;
        }
        return parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
}

// 确保在DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 这里不需要额外操作，因为推荐按钮已在batch.html中直接定义并绑定事件
});
