class MixedVideoParser {
    constructor() {

        this.bilibiliUrlOrBVREx = /(https?:\/\/(www\.bilibili\.com\/video\/|b23\.tv\/)[A-Za-z\d._?%&+\-=\/#]*)|(BV[A-Za-z0-9]{10,12})/g;
        this.douyinUrlOrBVREx = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?douyin\.com\/[A-Za-z0-9._?%&+\-=\/#]*/g;
        this.kuaishouUrlOrBVREx = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:kuaishou\.com|chenzhongtech\.com)\/[A-Za-z0-9._?%&+\-=\/#]*/g;
        this.xiaohongshuUrlOrBVREx = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:xiaohongshu\.com|xhslink\.com)\/[A-Za-z0-9._?%&+\-=\/#]*/g;

        this.allResults = [];
        this.currentSort = { field: '', order: 'desc' };

        // 平台标识
        this.platformFlags = {
            bilibili: false,
            douyin: false,
            kuaishou: false,
            xiaohongshu: false
        };
    }

    async parseMixedLinks(inputText, resultArea) {
        if (!inputText) {
            resultArea.innerHTML = '<div class="error">请输入视频链接</div>';
            return;
        }

        // 提取所有匹配的链接
        const biliMatches = inputText.match(this.bilibiliUrlOrBVREx);
        const douyinMatches = inputText.match(this.douyinUrlOrBVREx);
        const kuaishouMatches = inputText.match(this.kuaishouUrlOrBVREx);
        const xiaohongshuMatches = inputText.match(this.xiaohongshuUrlOrBVREx);

        // 重置结果和标识
        this.allResults = [];
        this.platformFlags.bilibili = false;
        this.platformFlags.douyin = false;
        this.platformFlags.kuaishou = false;
        this.platformFlags.xiaohongshu = false;

        // 显示加载状态
        let loadingText = '正在解析';
        if (biliMatches && biliMatches.length > 0) {
            loadingText += ` ${biliMatches.length} 个B站视频`;
        }
        if (douyinMatches && douyinMatches.length > 0) {
            loadingText += ` ${douyinMatches.length} 个抖音视频`;
        }
        if (kuaishouMatches && kuaishouMatches.length > 0) {
            loadingText += ` ${kuaishouMatches.length} 个快手视频`;
        }
        if (xiaohongshuMatches && xiaohongshuMatches.length > 0) {
            loadingText += ` ${xiaohongshuMatches.length} 个小红书视频`;
        }
        resultArea.innerHTML = `<div class="loading">${loadingText}...请稍候</div>
                                        <div class="newtons-cradle">
                                        <div class="newtons-cradle__dot"></div>
                                        <div class="newtons-cradle__dot"></div>
                                        <div class="newtons-cradle__dot"></div>
                                        <div class="newtons-cradle__dot"></div>
                                        </div>

                                        <div id="ghost">
                                        <div id="red">
                                        <div id="pupil"></div>
                                        <div id="pupil1"></div>
                                        <div id="eye"></div>
                                        <div id="eye1"></div>
                                        <div id="top0"></div>
                                        <div id="top1"></div>
                                        <div id="top2"></div>
                                        <div id="top3"></div>
                                        <div id="top4"></div>
                                        <div id="st0"></div>
                                        <div id="st1"></div>
                                        <div id="st2"></div>
                                        <div id="st3"></div>
                                        <div id="st4"></div>
                                        <div id="st5"></div>
                                        <div id="an1"></div>
                                        <div id="an2"></div>
                                        <div id="an3"></div>
                                        <div id="an4"></div>
                                        <div id="an5"></div>
                                        <div id="an6"></div>
                                        <div id="an7"></div>
                                        <div id="an8"></div>
                                        <div id="an9"></div>
                                        <div id="an10"></div>
                                        <div id="an11"></div>
                                        <div id="an12"></div>
                                        <div id="an13"></div>
                                        <div id="an14"></div>
                                        <div id="an15"></div>
                                        <div id="an16"></div>
                                        <div id="an17"></div>
                                        <div id="an18"></div>
                                        </div>
                                    <div id="shadow"></div>
                                </div>`;

        try {
            // 并行处理四种平台的链接
            const parsePromises = [];

            if (biliMatches && biliMatches.length > 0) {
                this.platformFlags.bilibili = true;
                // 处理B站链接
                parsePromises.push(this.parseBilibiliLinks(biliMatches));
            }

            if (douyinMatches && douyinMatches.length > 0) {
                this.platformFlags.douyin = true;
                // 处理抖音链接
                parsePromises.push(this.parseDouyinLinks(douyinMatches));
            }

            if (kuaishouMatches && kuaishouMatches.length > 0) {
                this.platformFlags.kuaishou = true;
                // 处理快手链接
                parsePromises.push(this.parseKuaishouLinks(kuaishouMatches));
            }

            if (xiaohongshuMatches && xiaohongshuMatches.length > 0) {
                this.platformFlags.xiaohongshu = true;
                // 处理小红书链接
                parsePromises.push(this.parseXiaohongshuLinks(xiaohongshuMatches));
            }

            // 等待所有解析完成
            await Promise.all(parsePromises);

            // 将混合平台解析结果同步到全局window.allResults变量
            window.allResults = [...this.allResults];

            // 更新结果表格
            this.updateMixedResultTable(resultArea);

            // 自动渲染混合平台图表
            // 延迟一小段时间确保DOM更新完成后再渲染图表
            setTimeout(() => {
                if (typeof renderMixedChart === 'function') {
                    renderMixedChart();
                }
            }, 100);
        } catch (error) {
            resultArea.innerHTML = `<div class="error">解析失败: ${error.message}</div>`;
        }
    }

    // Cookie操作函数
    setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
    }

    getCookie(name) {
        const cookieName = `${name}=`;
        const decodedCookie = decodeURIComponent(document.cookie);
        const cookieArray = decodedCookie.split(';');
        for (let i = 0; i < cookieArray.length; i++) {
            let cookie = cookieArray[i];
            while (cookie.charAt(0) === ' ') {
                cookie = cookie.substring(1);
            }
            if (cookie.indexOf(cookieName) === 0) {
                return cookie.substring(cookieName.length, cookie.length);
            }
        }
        return null;
    }

    // 加载设置
    loadSettings() {
        const settingsCookie = this.getCookie('appSettings');
        return JSON.parse(settingsCookie || '{}');
    }

    async parseBilibiliLinks(urls) {
        const settings = this.loadSettings();
        const maxVideos = settings.maxVideos || 20;
        const uniqueUrls = [...new Set(urls)].slice(0, maxVideos); // 限制最多maxVideos个

        // 并发请求处理函数
        const parallelRequest = async (urls, maxConcurrency, handler) => {
            const results = [];
            const executing = [];

            for (const url of urls) {
                const promise = handler(url)
                    .then(result => {
                        const index = executing.indexOf(promise);
                        if (index !== -1) executing.splice(index, 1);
                        return result;
                    })
                    .catch(error => {
                        const index = executing.indexOf(promise);
                        if (index !== -1) executing.splice(index, 1);
                        console.error(`处理 ${url} 失败:`, error);
                        return {
                            bvid: `错误: ${url}`,
                            title: '-',
                            author: '-',
                            stat: { view: '-', danmaku: '-', reply: '-', favorite: '-', coin: '-', share: '-', like: '-' },
                            platform: 'bilibili',
                            error: true
                        };
                    });

                results.push(promise);
                executing.push(promise);

                if (executing.length >= maxConcurrency) {
                    await Promise.race(executing);
                }
            }

            return Promise.all(results);
        };

        const results = await parallelRequest(uniqueUrls, 5, this.parseBilibiliVideo.bind(this));
        this.allResults.push(...results);
    }

    async parseBilibiliVideo(bilibiliUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const requestUrl = `https://api.yutangxiaowu.cn/api/4c/bili/combinedVideo?url=${encodeURIComponent(bilibiliUrl)}`;
            
            const response = await this._authenticatedFetch(requestUrl, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 && typeof checkAuth === 'function') {
                    // 尝试刷新Auth状态（如果环境支持）
                    checkAuth();
                }
                throw new Error('网络响应失败');
            }

            const data = await response.json();

            if (data.code === 0) {
                return {
                    bvid: data.data.bvid,
                    title: data.data.video.title,
                    pic: data.data.video.fm,
                    author: data.data.owner.name,
                    url: data.data.video.url,
                    stat: data.data.stat,
                    platform: 'bilibili'
                };
            } else {
                return {
                    bvid: `解析失败: ${bilibiliUrl}`,
                    title: '-',
                    author: '-',
                    stat: {
                        view: '-',
                        danmaku: '-',
                        reply: '-',
                        favorite: '-',
                        coin: '-',
                        share: '-',
                        like: '-'
                    },
                    platform: 'bilibili',
                    error: true
                };
            }
        } catch (error) {
            return {
                bvid: error.name === 'AbortError' ?
                    `超时: ${bilibiliUrl}` :
                    `错误: ${bilibiliUrl}`,
                title: '-',
                author: '-',
                stat: {
                    view: '-',
                    danmaku: '-',
                    reply: '-',
                    favorite: '-',
                    coin: '-',
                    share: '-',
                    like: '-'
                },
                platform: 'bilibili',
                error: true
            };
        }
    }

    async parseDouyinLinks(urls) {
        const settings = this.loadSettings();
        const maxVideos = settings.maxVideos || 20;
        const uniqueUrls = [...new Set(urls)].slice(0, maxVideos); // 限制最多maxVideos个

        for (const url of uniqueUrls) {
            await this.parseDouyinVideo(url);
        }
    }

    async parseDouyinVideo(douyinUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const requestUrl = `https://api.yutangxiaowu.cn/api/4c/douyin/parse`;

            const response = await this._authenticatedFetch(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: douyinUrl
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 && typeof checkAuth === 'function') {
                    checkAuth();
                }
                throw new Error('网络响应失败');
            }

            const data = await response.json();

            if (data.code === 0) {
                this.allResults.push({
                    vid: data.data.vid,
                    title: data.data.video.title,
                    url: data.data.video.url,
                    pic: data.data.video.fm,
                    author: data.data.owner.name,
                    stat: data.data.stat,
                    platform: 'douyin'
                });
            } else {
                this.allResults.push({
                    vid: `解析失败: ${douyinUrl}`,
                    title: '-',
                    author: '-',
                    stat: {
                        reply: '-',
                        favorite: '-',
                        recommend: '-',
                        share: '-',
                        like: '-'
                    },
                    platform: 'douyin',
                    error: true
                });
            }
        } catch (error) {
            this.allResults.push({
                vid: error.name === 'AbortError' ?
                    `超时: ${douyinUrl}` :
                    `错误: ${douyinUrl}`,
                title: '-',
                author: '-',
                stat: {
                    reply: '-',
                    favorite: '-',
                    recommend: '-',
                    share: '-',
                    like: '-'
                },
                platform: 'douyin',
                error: true
            });
        }
    }

    async parseKuaishouLinks(urls) {
        const settings = this.loadSettings();
        const maxVideos = settings.maxVideos || 20;
        const uniqueUrls = [...new Set(urls)].slice(0, maxVideos); // 限制最多maxVideos个

        for (const url of uniqueUrls) {
            await this.parseKuaishouVideo(url);
        }
    }

    async parseKuaishouVideo(kuaishouUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            // 使用 authFetch 并移除 username 参数
            const requestUrl = `https://api.yutangxiaowu.cn/api/4c/kuaishou?url=${kuaishouUrl}`;

            const response = await this._authenticatedFetch(requestUrl, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 && typeof checkAuth === 'function') {
                    checkAuth();
                }
                throw new Error('网络响应失败');
            }

            const data = await response.json();

            if (data.code === 0) {
                const result = {
                    vid: data.data.vid,
                    title: data.data.video.title,
                    url: data.data.video.url,
                    pic: data.data.video.fm,
                    author: data.data.owner.name,
                    stat: data.data.stat,
                    createTime: data.data.createTime,
                    platform: 'kuaishou'
                };
                this.allResults.push(result);
                return result;
            } else {
                const result = {
                    vid: `解析失败: ${kuaishouUrl}`,
                    title: '-',
                    author: '-',
                    stat: {
                        view: '-',
                        like: '-',
                        comment: '-',
                        share: '-'
                    },
                    platform: 'kuaishou',
                    error: true
                };
                this.allResults.push(result);
                return result;
            }
        } catch (error) {
            const result = {
                vid: error.name === 'AbortError' ?
                    `超时: ${kuaishouUrl}` :
                    `错误: ${kuaishouUrl}`,
                title: '-',
                author: '-',
                stat: {
                    view: '-',
                    like: '-',
                    comment: '-',
                    share: '-'
                },
                platform: 'kuaishou',
                error: true
            };
            this.allResults.push(result);
            return result;
        }
    }

    async parseXiaohongshuLinks(urls) {
        const settings = this.loadSettings();
        const maxVideos = settings.maxVideos || 20;
        const uniqueUrls = [...new Set(urls)].slice(0, maxVideos); // 限制最多maxVideos个

        for (const url of uniqueUrls) {
            await this.parseXiaohongshuVideo(url);
        }
    }

    async parseXiaohongshuVideo(xiaohongshuUrl) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const requestUrl = `https://api.yutangxiaowu.cn/api/4c/xiaohongshu?content=${encodeURIComponent(xiaohongshuUrl)}`;

            const response = await this._authenticatedFetch(requestUrl, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401 && typeof checkAuth === 'function') {
                    checkAuth();
                }
                throw new Error('网络响应失败');
            }

            const data = await response.json();

            if (data.code === 0) {
                let coverUrl = data.data.video.fm;
                // 解决Mixed Content和防盗链问题
                if (coverUrl && coverUrl.startsWith('http')) {
                    coverUrl = `https://api.yutangxiaowu.cn/api/4c/proxy/image?url=${encodeURIComponent(coverUrl)}`;
                }

                const result = {
                    vid: data.data.vid,
                    title: data.data.video.title,
                    url: data.data.video.url,
                    pic: coverUrl,
                    author: data.data.owner.name,
                    stat: {
                        ...data.data.stat,
                        view: '-',  // 小红书没有播放量，强制设为 -
                        favorite: '-' // 小红书可能没有收藏数，强制设为 -
                    },
                    createTime: data.data.createTime,
                    platform: 'xiaohongshu'
                };
                this.allResults.push(result);
                return result;
            } else {
                const result = {
                    vid: `解析失败: ${xiaohongshuUrl}`,
                    title: '-',
                    author: '-',
                    stat: {
                        view: '-',
                        like: '-',
                        comment: '-',
                        share: '-',
                        favorite: '-'
                    },
                    platform: 'xiaohongshu',
                    error: true
                };
                this.allResults.push(result);
                return result;
            }
        } catch (error) {
            const result = {
                vid: error.name === 'AbortError' ?
                    `超时: ${xiaohongshuUrl}` :
                    `错误: ${xiaohongshuUrl}`,
                title: '-',
                author: '-',
                stat: {
                    view: '-',
                    like: '-',
                    comment: '-',
                    share: '-',
                    favorite: '-'
                },
                platform: 'xiaohongshu',
                error: true
            };
            this.allResults.push(result);
            return result;
        }
    }

    // 统一的带认证Fetch请求辅助方法
    async _authenticatedFetch(url, options = {}) {
        // 如果全局定义了 authFetch，直接使用它（它会处理 Token）
        if (typeof authFetch === 'function') {
            return authFetch(url, options);
        }

        // 降级处理：使用原生 fetch 并手动添加 Token
        const token = localStorage.getItem('token');
        const headers = { ...options.headers };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return fetch(url, { ...options, headers });
    }

    updateMixedResultTable(resultArea) {
        if (this.allResults.length === 0) {
            resultArea.innerHTML = '<div class="error">没有解析到任何有效视频信息</div>';
            return;
        }

        // 尝试保存当前的图表设置
        let currentChartType = 'bar';
        let currentChartLimit = '5';
        let currentChartDimension = 'all';
        
        const oldChartType = resultArea.querySelector('#mixed-chart-type');
        if (oldChartType) currentChartType = oldChartType.value;
        
        const oldChartLimit = resultArea.querySelector('#mixed-chart-limit');
        if (oldChartLimit) currentChartLimit = oldChartLimit.value;
        
        const oldChartDimension = resultArea.querySelector('#mixed-chart-dimension');
        if (oldChartDimension) currentChartDimension = oldChartDimension.value;

        // 获取当前选择的平台
        let platformFilter = resultArea.querySelector('#platform-filter');
        if (!platformFilter) {
            platformFilter = document.getElementById('platform-filter');
        }
        const selectedPlatform = platformFilter ? platformFilter.value : 'all';

        // 根据选择的平台过滤数据
        let filteredResults = [];
        switch (selectedPlatform) {
            case 'bilibili':
                filteredResults = this.allResults.filter(item => item.platform === 'bilibili');
                break;
            case 'douyin':
                filteredResults = this.allResults.filter(item => item.platform === 'douyin');
                break;
            case 'kuaishou':
                filteredResults = this.allResults.filter(item => item.platform === 'kuaishou');
                break;
            default:
                filteredResults = [...this.allResults];
        }

        // 数据去重：确保没有重复的视频显示
        const uniqueResults = [];
        const seenIds = new Set();
        
        filteredResults.forEach(item => {
            // 获取唯一标识符
            let id = item.bvid || item.vid;
            // 如果没有ID（解析失败的情况），尝试使用URL
            if (!id && item.url) {
                id = item.url;
            }
            // 如果连URL都没有，生成一个临时ID
            if (!id) {
                id = `unknown-${Math.random()}`;
            }
            
            const key = `${item.platform}-${id}`;
            
            if (!seenIds.has(key)) {
                seenIds.add(key);
                uniqueResults.push(item);
            }
        });
        
        filteredResults = uniqueResults;

        if (filteredResults.length === 0) {
            resultArea.innerHTML = '<div class="error">当前平台没有解析到任何有效视频信息</div>';
            return;
        }

        // 构建表格HTML
        let tableHtml = `
            <div class="sort-controls">
                <button id="export-button" class="button-excel" type="button">
                    <span class="button-excel__text">导出Excel</span>
                        <span class="button-excel__icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 35 35" id="bdd05811-e15d-428c-bb53-8661459f9307" data-name="Layer 2" class="svg">
                            <path d="M17.5,22.131a1.249,1.249,0,0,1-1.25-1.25V2.187a1.25,1.25,0,0,1,2.5,0V20.881A1.25,1.25,0,0,1,17.5,22.131Z"></path>
                            <path d="M17.5,22.693a3.189,3.189,0,0,1-2.262-.936L8.487,15.006a1.249,1.249,0,0,1,1.767-1.767l6.751,6.751a.7.7,0,0,0,.99,0l6.751-6.751a1.25,1.25,0,0,1,1.768,1.767l-6.752,6.751A3.191,3.191,0,0,1,17.5,22.693Z"></path>
                            <path d="M31.436,34.063H3.564A3.318,3.318,0,0,1,.25,30.749V22.011a1.25,1.25,0,0,1,2.5,0v8.738a.815.815,0,0,0,.814.814H31.436a.815.815,0,0,0,.814-.814V22.011a1.25,1.25,0,1,1,2.5,0v8.738A3.318,3.318,0,0,1,31.436,34.063Z"></path>
                        </svg>
                    </span>
                </button>
            <button id="recommend-mixed-button" class="button-recommend">推荐最佳视频<span></span><span></span><span></span><span></span></button>
            <div style="display: inline-block; position: relative;">
                <select id="recommend-mixed-num-select" style="
                    height: 40px; 
                    margin-left: 5px; 
                    padding: 0 10px; 
                    border: 1px solid #03a9f4; 
                    border-radius: 4px; 
                    background: rgba(3, 169, 244, 0.1); 
                    color: #03a9f4; 
                    cursor: pointer;
                    font-weight: bold;
                ">
                    <option value="5" selected>Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="20">Top 20</option>
                    <option value="all">全部</option>
                </select>
            </div>
            <button id="ai-analysis-mixed-button" type="button" class="button-recommend" onclick="console.log('Clicked AI button'); if(window.handleMixedAIAnalysisGlobal) { window.handleMixedAIAnalysisGlobal(window.allResults); } else { alert('AI分析功能未加载，请刷新页面'); }">AI智能分析<span></span><span></span><span></span><span></span></button>
            <button id="generate-overall-wordcloud" class="button-recommend">生成整体词云<span></span><span></span><span></span><span></span></button>
            <select id="platform-filter" class="export-button">
                <option value="all" ${selectedPlatform === 'all' ? 'selected' : ''}>所有平台</option>
                <option value="bilibili" ${selectedPlatform === 'bilibili' ? 'selected' : ''}>仅B站</option>
                <option value="douyin" ${selectedPlatform === 'douyin' ? 'selected' : ''}>仅抖音</option>
                <option value="kuaishou" ${selectedPlatform === 'kuaishou' ? 'selected' : ''}>仅快手</option>
                <option value="xiaohongshu" ${selectedPlatform === 'xiaohongshu' ? 'selected' : ''}>仅小红书</option>
            </select>
            <div>
                <select id="mixed-sort-field" class="export-button">
                    <option value="">按字段排序</option>
                    <option value="like">点赞数</option>
        `;

        // 评论数/弹幕
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'douyin' || selectedPlatform === 'xiaohongshu') {
            tableHtml += `<option value="reply">评论数</option>`;
        }
        if (selectedPlatform === 'kuaishou') {
            tableHtml += `<option value="comment">评论数</option>`;
        }

        // 收藏
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'douyin' || selectedPlatform === 'xiaohongshu') {
            tableHtml += `<option value="favorite">收藏数</option>`;
        }

        // 播放量
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'kuaishou') {
            tableHtml += `<option value="view">播放量</option>`;
        }

        // 硬币/弹幕 (B站特有)
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili') {
            tableHtml += `
                    <option value="coin">硬币数</option>
                    <option value="danmaku">弹幕数</option>
            `;
        }

        // 分享
        tableHtml += `<option value="share">分享数</option>`;

        tableHtml += `
                </select>
                <select id="mixed-sort-order" class="export-button">
                    <option value="desc">降序</option>
                    <option value="asc">升序</option>
                </select>
            </div>
        </div>

        <div class="table-container">
            <table class="result-table">
                <thead>
                    <tr>
                        <th>平台</th>
                        <th>视频ID</th>
                        <th>视频标题</th>
                        <th>作者</th>`;

        // 播放量
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'kuaishou') {
            tableHtml += `<th>播放量</th>`;
        }

        tableHtml += `<th>点赞数</th>`;

        // 评论数
        tableHtml += `<th>评论数</th>`;

        // 收藏数
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'douyin' || selectedPlatform === 'xiaohongshu') {
            tableHtml += `<th>收藏数</th>`;
        }

        // 硬币/弹幕
        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili') {
            tableHtml += `<th>硬币数</th>`;
        }

        tableHtml += `<th>分享数</th>`;

        if (selectedPlatform === 'all' || selectedPlatform === 'bilibili') {
            tableHtml += `<th>弹幕数</th>`;
        }

        if (selectedPlatform === 'all' || selectedPlatform === 'douyin') {
            tableHtml += `<th>推荐数</th>`;
        }

        tableHtml += `
                        <th data-sort="totalScore">综合得分</th>
                        <th>播放</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
        `;

        const filteredData = filteredResults;
        const displayData = this.currentSort.field
            ? this.sortMixedData([...filteredData])
            : filteredData;

        displayData.forEach(item => {
            const rowClass = item.error ? 'style="color: #ff4d4f;"' : '';
            let platformName = '';
            let itemId = '';

            if (item.platform === 'bilibili') {
                platformName = 'B站';
                itemId = item.bvid;
            } else if (item.platform === 'douyin') {
                platformName = '抖音';
                itemId = item.vid;
            } else if (item.platform === 'kuaishou') {
                platformName = '快手';
                itemId = item.vid;
            } else if (item.platform === 'xiaohongshu') {
                platformName = '小红书';
                itemId = item.vid;
            }

            tableHtml += `<tr ${rowClass}>`;
            tableHtml += `<td>${platformName}</td>`;
            tableHtml += `<td>${itemId}</td>`;
            tableHtml += `<td class="title-cell">${item.title}</td>`;
            tableHtml += `<td class="author-cell">${item.author}</td>`;

            // 播放量
            if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'kuaishou') {
                const view = item.platform === 'xiaohongshu' ? '-' : (this.formatNumber(item.stat.view || '-'));
                tableHtml += `<td>${view}</td>`;
            }

            // 点赞数
            tableHtml += `<td>${this.formatNumber(item.stat.like || '-')}</td>`;

            // 评论数 (Kuaishou/Xiaohongshu use 'comment', others use 'reply')
            const commentCount = item.stat.reply || item.stat.comment || '-';
            tableHtml += `<td>${this.formatNumber(commentCount)}</td>`;

            // 收藏数
            if (selectedPlatform === 'all' || selectedPlatform === 'bilibili' || selectedPlatform === 'douyin' || selectedPlatform === 'xiaohongshu') {
                const favorite = item.platform === 'xiaohongshu' ? '-' : (this.formatNumber(item.stat.favorite || '-'));
                tableHtml += `<td>${favorite}</td>`;
            }

            // 硬币数
            if (selectedPlatform === 'all' || selectedPlatform === 'bilibili') {
                tableHtml += `<td>${this.formatNumber(item.stat.coin || '-')}</td>`;
            }

            // 分享数
            tableHtml += `<td>${this.formatNumber(item.stat.share || '-')}</td>`;

            // 弹幕数
            if (selectedPlatform === 'all' || selectedPlatform === 'bilibili') {
                tableHtml += `<td>${this.formatNumber(item.stat.danmaku || '-')}</td>`;
            }

            // 推荐数
            if (selectedPlatform === 'all' || selectedPlatform === 'douyin') {
                tableHtml += `<td>${this.formatNumber(item.stat.recommend || '-')}</td>`;
            }

            // 综合评分
            let scoreDisplay = '-';
            if (item.totalScore !== undefined || item.finalScore !== undefined) {
                const score = item.totalScore !== undefined ? item.totalScore : item.finalScore;
                let tooltip = '';
                if (window.mixedRecommender && typeof window.mixedRecommender.generateTooltip === 'function') {
                    tooltip = window.mixedRecommender.generateTooltip(item);
                } else if (item.platform === 'xiaohongshu') {
                     tooltip = `综合得分: ${score.toFixed(4)}`;
                } else {
                    tooltip = `最终得分: ${score.toFixed(4)}`;
                }
                
                let color = '#ff5000';
                if (item.platform === 'xiaohongshu') color = '#ff2442';
                else if (item.platform === 'bilibili') color = '#fb7299';
                else if (item.platform === 'douyin') color = '#23ade5'; // Douyin uses black/white usually but let's keep consistent with existing
                
                scoreDisplay = `<span style="color: ${color}; font-weight: bold; cursor: help; border-bottom: 1px dashed ${color};" title="${tooltip}">${score.toFixed(4)}</span>`;
            }

            tableHtml += `<td>${scoreDisplay}</td>`;

            // 播放链接
            let playUrl = '#';
            if (item.platform === 'bilibili') {
                playUrl = `https://www.bilibili.com/video/${item.bvid}`;
            } else if (item.platform === 'douyin') {
                playUrl = `https://www.douyin.com/video/${item.vid}`;
            } else if (item.platform === 'kuaishou') {
                playUrl = `https://www.kuaishou.com/short-video/${item.vid}`;
            } else if (item.platform === 'xiaohongshu') {
                playUrl = item.url || `https://www.xiaohongshu.com/explore/${item.vid}`;
            }

            tableHtml += `<td><button class="play-btn"><a href="${playUrl}" target="_blank">播放</a></button></td>`;

            // 对itemId进行HTML转义，确保特殊字符不会破坏HTML结构
            const escapedItemId = itemId.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            tableHtml += `<td>`;
            tableHtml += `<button class="delete-btn" data-platform="${item.platform}" data-id="${escapedItemId}">删除</button>`;
            // 只对B站视频显示词云按钮
            if (item.platform === 'bilibili') {
                // 对bvid也进行转义
                const escapedBvid = item.bvid.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                tableHtml += `<button class="wordcloud-btn" data-bvid="${escapedBvid}">词云</button>`;
            }
            tableHtml += `</td>`;

            tableHtml += `</tr>`;
        });

        tableHtml += `
                </tbody>
            </table>
        </div>
        
        <div class="chart-controls">
            <span>图表类型:</span>
            <select id="mixed-chart-type" class="chart-selector">
                <option value="bar">条形图</option>
                <option value="line">折线图</option>
                <option value="radar">雷达图</option>
                <option value="polarArea">极坐标图</option>
                <option value="pie">饼图</option>
                <option value="doughnut">环形图</option>
            </select>
            <span>显示维度:</span>
            <select id="mixed-chart-dimension" class="chart-selector">
                <option value="all">全部维度</option>
                <option value="view">播放量</option>
                <option value="like">点赞数</option>
                <option value="reply">评论数</option>
                <option value="favorite">收藏数</option>
                <option value="coin">硬币数</option>
                <option value="share">分享数</option>
                <option value="danmaku">弹幕数</option>
                <option value="recommend">推荐数</option>
            </select>
            <span>显示数量:</span>
            <select id="mixed-chart-limit" class="chart-selector">
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="all">全部</option>
            </select>
            <span>导出格式:</span>
            <select id="mixed-export-format" class="chart-selector">
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
            </select>
            <button id="export-mixed-chart" class="export-pic-button">导出统计图</button>
        </div>
        <div class="chart-container">
            <canvas id="mixed-video-stats-chart" class="chart-wrapper"></canvas>
        </div>
        `;

        resultArea.innerHTML = tableHtml;

        // 恢复图表设置
        const newChartType = resultArea.querySelector('#mixed-chart-type');
        if (newChartType) newChartType.value = currentChartType;

        const newChartLimit = resultArea.querySelector('#mixed-chart-limit');
        if (newChartLimit) newChartLimit.value = currentChartLimit;

        const newChartDimension = resultArea.querySelector('#mixed-chart-dimension');
        if (newChartDimension) newChartDimension.value = currentChartDimension;

        const newPlatformFilter = resultArea.querySelector('#platform-filter');
        if (newPlatformFilter) {
            if (!newPlatformFilter.hasAttribute('data-listener-added')) {
                newPlatformFilter.addEventListener('change', () => {
                    this.updateMixedResultTable(resultArea);
                });
                newPlatformFilter.setAttribute('data-listener-added', 'true');
            }
        }

        this.addEventListeners(resultArea);

        // 自动重新渲染图表
        setTimeout(() => {
            if (typeof renderMixedChart === 'function') {
                renderMixedChart(currentChartType, currentChartLimit, currentChartDimension);
            }
        }, 100);
    }

    filterData(selectedPlatform = 'all') {
        if (selectedPlatform === 'all') {
            let platformFilter = document.querySelector('#platform-filter');
            if (!platformFilter) {
                platformFilter = document.getElementById('platform-filter');
            }
            selectedPlatform = platformFilter ? platformFilter.value : 'all';
        }

        switch (selectedPlatform) {
            case 'bilibili':
                return this.allResults.filter(item => item.platform === 'bilibili');
            case 'douyin':
                return this.allResults.filter(item => item.platform === 'douyin');
            case 'kuaishou':
                return this.allResults.filter(item => item.platform === 'kuaishou');
            case 'xiaohongshu':
                return this.allResults.filter(item => item.platform === 'xiaohongshu');
            default:
                return [...this.allResults];
        }
    }

    filterSinglePlatformData(platform) {
        return this.allResults.filter(item => item.platform === platform);
    }

    sortMixedData(data) {
        const { field, order } = this.currentSort;
        if (!field) return data;

        return data.sort((a, b) => {
            if (a.error) return 1;
            if (b.error) return -1;

            let valueA, valueB;
            let fieldA = field;
            let fieldB = field;

            if (field === 'reply' && (a.platform === 'kuaishou' || a.platform === 'xiaohongshu')) fieldA = 'comment';
            if (field === 'reply' && (b.platform === 'kuaishou' || b.platform === 'xiaohongshu')) fieldB = 'comment';

            valueA = Number(a.stat[fieldA]) || 0;
            valueB = Number(b.stat[fieldB]) || 0;

            return order === 'asc' ? valueA - valueB : valueB - valueA;
        });
    }

    addEventListeners(resultArea) {
        const recommendButton = resultArea.querySelector('#recommend-mixed-button');
        if (recommendButton) {
            recommendButton.addEventListener('click', () => {
                if (this.allResults && this.allResults.length > 0) {
                    if (window.mixedRecommender) {
                        const rankedVideos = window.mixedRecommender.recommend(this.allResults);

                        const topNSelect = resultArea.querySelector('#recommend-mixed-num-select');
                        const topNValue = topNSelect ? topNSelect.value : '5';
                        const topN = topNValue === 'all' ? rankedVideos.length : parseInt(topNValue);

                        this.allResults = this.allResults.map(video => {
                            const rankedVideo = rankedVideos.find(rv => {
                                if (rv.platform !== video.platform) return false;

                                // 严格匹配：只有当字段存在且相等时才算匹配
                                // 避免 undefined === undefined 导致的错误匹配
                                if (video.bvid && rv.bvid === video.bvid) return true;
                                if (video.vid && rv.vid === video.vid) return true;
                                if (video.url && rv.url === video.url) return true;

                                return false;
                            });
                            return rankedVideo ? rankedVideo : video;
                        });

                        const report = window.mixedRecommender.generateRecommendationReport(rankedVideos, topN);

                        const oldReports = document.querySelectorAll('.recommendation-report');
                        oldReports.forEach(report => report.remove());

                        resultArea.insertAdjacentHTML('afterend', report);

                        this.updateMixedResultTable(resultArea);

                        // 自动重新渲染图表
                        setTimeout(() => {
                            if (typeof renderMixedChart === 'function') {
                                const chartTypeSelect = resultArea.querySelector('#mixed-chart-type');
                                const chartLimitSelect = resultArea.querySelector('#mixed-chart-limit');
                                const chartDimensionSelect = resultArea.querySelector('#mixed-chart-dimension');

                                const chartType = chartTypeSelect ? chartTypeSelect.value : 'bar';
                                const chartLimit = chartLimitSelect ? chartLimitSelect.value : '5';
                                const chartDimension = chartDimensionSelect ? chartDimensionSelect.value : 'all';

                                renderMixedChart(chartType, chartLimit, chartDimension);
                            }
                        }, 100);
                    } else {
                        console.error('MixedVideoRecommender not found');
                        alert('推荐功能未初始化');
                    }
                }
            });
        }

        const aiAnalysisButton = document.getElementById('ai-analysis-mixed-button');
        if (aiAnalysisButton) {
            // 移除旧的事件监听器以防止重复绑定（虽然addEventListener默认支持多重绑定，但为了安全）
            const newAiBtn = aiAnalysisButton.cloneNode(true);
            aiAnalysisButton.parentNode.replaceChild(newAiBtn, aiAnalysisButton);
            
            newAiBtn.addEventListener('click', () => {
                if (typeof handleMixedAIAnalysisGlobal === 'function') {
                    handleMixedAIAnalysisGlobal(this.allResults);
                } else {
                    alert('AI分析功能未初始化');
                }
            });
        }

        const exportButton = resultArea.querySelector('#export-button');
        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportToExcel());
        }

        const sortField = resultArea.querySelector('#mixed-sort-field');
        if (sortField) {
            sortField.addEventListener('change', () => this.handleSortChange(resultArea));
        }

        const sortOrder = resultArea.querySelector('#mixed-sort-order');
        if (sortOrder) {
            sortOrder.addEventListener('change', () => this.handleSortChange(resultArea));
        }

        resultArea.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const platform = e.target.getAttribute('data-platform');
                const id = e.target.getAttribute('data-id');
                this.deleteVideo(platform, id);
                this.updateMixedResultTable(resultArea);
            });
        });

        const chartTypeSelect = resultArea.querySelector('#mixed-chart-type');
        const chartDimensionSelect = resultArea.querySelector('#mixed-chart-dimension');
        const chartLimitSelect = resultArea.querySelector('#mixed-chart-limit');
        const exportChartButton = resultArea.querySelector('#export-mixed-chart');

        const updateMixedChart = () => {
            if (typeof renderMixedChart === 'function') {
                const chartType = chartTypeSelect ? chartTypeSelect.value : 'bar';
                const chartLimit = chartLimitSelect ? chartLimitSelect.value : '5';
                const chartDimension = chartDimensionSelect ? chartDimensionSelect.value : 'all';
                renderMixedChart(chartType, chartLimit, chartDimension);
            }
        };

        if (chartTypeSelect) {
            chartTypeSelect.addEventListener('change', updateMixedChart);
        }

        if (chartDimensionSelect) {
            chartDimensionSelect.addEventListener('change', updateMixedChart);
        }

        if (chartLimitSelect) {
            chartLimitSelect.addEventListener('change', updateMixedChart);
        }

        if (exportChartButton) {
            exportChartButton.addEventListener('click', () => {
                const chartInstance = window.mixedVideoChart;
                if (chartInstance) {
                    const exportFormatSelect = resultArea.querySelector('#mixed-export-format');
                    const format = exportFormatSelect ? exportFormatSelect.value : 'png';
                    this.exportMixedChart(chartInstance, format, '混合平台视频数据图表');
                } else {
                    alert('没有可导出的图表');
                }
            });
        }
    }

    handleSortChange(resultArea) {
        const sortField = document.getElementById('mixed-sort-field');
        const sortOrder = document.getElementById('mixed-sort-order');

        if (sortField && sortOrder) {
            this.currentSort = {
                field: sortField.value,
                order: sortOrder.value
            };
            this.updateMixedResultTable(resultArea);
        }
    }

    // HTML反转义函数
    unescapeHtml(str) {
        return str
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    deleteVideo(platform, id) {
        // 对id进行HTML反转义，确保与原始数据匹配
        const unescapedId = this.unescapeHtml(id);
        this.allResults = this.allResults.filter(item => {
            if (platform === 'bilibili') {
                return item.bvid !== unescapedId;
            } else if (platform === 'douyin') {
                return item.vid !== unescapedId;
            } else if (platform === 'kuaishou') {
                return item.vid !== unescapedId;
            } else if (platform === 'xiaohongshu') {
                return item.vid !== unescapedId;
            }
            return true;
        });
        
        // 同步更新全局变量，确保图表渲染使用的是最新数据
        if (typeof window !== 'undefined') {
            window.allResults = [...this.allResults];
            // 如果存在全局解析器实例引用，也尝试更新它（虽然这里就是实例本身的方法）
            if (window.mixedParser) {
                window.mixedParser.allResults = [...this.allResults];
            }
        }
    }

    exportToExcel() {
        if (typeof window.exportToMixedExcel === 'function') {
            window.exportToMixedExcel(this.allResults);
        } else {
            console.error('exportToMixedExcel function not found. Please make sure mixed-xlxs.js is loaded.');
            alert('导出功能未加载，请刷新页面重试');
        }
    }

    formatNumber(num) {
        if (num === '-' || num === undefined) return '-';
        if (typeof num === 'string' && isNaN(num)) return num;
        return parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    exportMixedChart(chartInstance, format, fileName) {
        if (!chartInstance) {
            alert('没有可导出的图表');
            return;
        }

        try {
            const statusElement = document.createElement('div');
            statusElement.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                z-index: 10000;
                font-size: 16px;
            `;
            statusElement.textContent = '正在导出图表...';
            document.body.appendChild(statusElement);

            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const quality = format === 'jpeg' ? 0.9 : 1.0;

            const exportOptions = {
                format: format,
                quality: quality,
                backgroundColor: 'white'
            };

            const chartUrl = chartInstance.toBase64Image(exportOptions);

            const link = document.createElement('a');
            link.href = chartUrl;
            link.download = `${fileName}_${new Date().toLocaleDateString().replace(/\//g, '-')}.${format}`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => {
                document.body.removeChild(statusElement);
            }, 1000);

        } catch (error) {
            console.error('图表导出失败:', error);
            alert('图表导出失败，请检查控制台获取详细信息');
            const statusElement = document.querySelector('div[style*="position: fixed"]');
            if (statusElement) {
                document.body.removeChild(statusElement);
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MixedVideoParser;
}
