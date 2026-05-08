// 渲染混合平台统计图表
function renderMixedChart(chartType = 'bar', limit = '5', dimension = 'all') {
    console.log('renderMixedChart called with:', { chartType, limit, dimension });

    // 确保DOM已经完全加载
    if (document.readyState !== 'complete') {
        console.log('DOM not ready, waiting for load event');
        window.addEventListener('load', () => {
            renderMixedChart(chartType, limit, dimension);
        });
        return;
    }

    let allResults = [];

    // 检查实际应用环境数据（优先级最高）
    if (window.mixedParser && window.mixedParser.allResults && Array.isArray(window.mixedParser.allResults) && window.mixedParser.allResults.length > 0) {
        allResults = [...window.mixedParser.allResults]; // 创建副本以避免修改原始数据
        console.log('Using data from mixedParser.allResults:', allResults);
    }
    // 检查测试环境数据
    else if (window.allResults && Array.isArray(window.allResults) && window.allResults.length > 0) {
        allResults = [...window.allResults]; // 创建副本以避免修改原始数据
        console.log('Using test data from window.allResults:', allResults);
    }
    // 如果都没有数据，记录警告
    else {
        console.warn('No data found for chart rendering');
        return;
    }

    // 获取当前选择的平台并过滤数据
    let platformFilter = document.querySelector('#platform-filter');
    // 如果找不到，则从全局文档中查找
    if (!platformFilter) {
        platformFilter = document.getElementById('platform-filter');
    }
    const selectedPlatform = platformFilter ? platformFilter.value : 'all';

    // 根据选择的平台过滤数据
    switch (selectedPlatform) {
        case 'bilibili':
            allResults = allResults.filter(item => item.platform === 'bilibili');
            break;
        case 'douyin':
            allResults = allResults.filter(item => item.platform === 'douyin');
            break;
        case 'kuaishou':
            allResults = allResults.filter(item => item.platform === 'kuaishou');
            break;
        default:
            // 确保使用完整的数据集
            if (window.allResults && Array.isArray(window.allResults) && window.allResults.length > 0) {
                allResults = window.allResults;
            } else if (window.mixedParser && window.mixedParser.allResults && Array.isArray(window.mixedParser.allResults) && window.mixedParser.allResults.length > 0) {
                allResults = window.mixedParser.allResults;
            }
            break;
    }


    // 修改validVideos过滤条件，增强容错能力
    const validVideos = allResults.filter(video => {
        if (!video || !video.stat) return false;

        // 针对不同平台分别处理，降低有效字段的要求
        const platform = video.platform || '';

        // B站视频的必要字段
        const bilibiliFields = ['view', 'danmaku', 'reply', 'favorite', 'coin', 'share', 'like'];
        // 抖音视频的必要字段
        const douyinFields = ['view', 'reply', 'favorite', 'share', 'like', 'recommend'];
        // 快手视频的必要字段
        const kuaishouFields = ['view', 'like', 'comment', 'share'];

        // 根据平台选择字段列表
        const fields = platform === 'bilibili' ? bilibiliFields :
            platform === 'douyin' ? douyinFields :
                platform === 'kuaishou' ? kuaishouFields :
                    [...bilibiliFields, ...douyinFields, ...kuaishouFields];

        // 只要至少有一个字段有效就认为是有效视频
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const value = video.stat[field];
            if (value !== '-' && value !== undefined && value !== null && !isNaN(Number(value))) {
                return true; // 只要有一个字段有效就通过验证
            }
        }

        // 如果没有任何有效字段，则返回false
        return false;
    });


    if (validVideos.length === 0) {
        console.warn('No valid videos found for chart rendering');
        return;
    }

    // 根据当前选择的维度排序并限制数量
    let displayVideos = [...validVideos];

    // 使用getMetricValue函数替换简单的默认值处理逻辑
    // 如果选择了单一维度，则按该维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => {
            const aValue = getMetricValue(a.stat, dimension, a.platform);
            const bValue = getMetricValue(b.stat, dimension, b.platform);
            return bValue - aValue;
        });
    }
    else {
        // 否则按综合得分排序（如果有）
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 确保至少有一些数据显示
    if (displayVideos.length === 0 && validVideos.length > 0) {
        displayVideos = [...validVideos].slice(0, 5);
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    console.log('准备图表数据，displayVideos数量:', displayVideos.length);

    // 准备图表数据
    const labels = displayVideos.map(video => {
        // 添加平台标识
        let platformLabel = '';
        if (video.platform === 'bilibili') {
            platformLabel = '[B站]';
        } else if (video.platform === 'douyin') {
            platformLabel = '[抖音]';
        } else if (video.platform === 'kuaishou') {
            platformLabel = '[快手]';
        } else {
            platformLabel = '[未知]';
        }

        const title = video.title || '未知标题';
        // 截断过长的标题
        const truncatedTitle = title.length > 15 ? title.substring(0, 15) + '...' : title;
        return `${truncatedTitle} ${platformLabel}`;
    });

    console.log('图表labels:', labels);

    // 指标配置 - 包含平台标识颜色
    const metrics = [
        { key: 'view', name: '播放量', color: 'rgba(54, 162, 235, 0.7)' },
        { key: 'danmaku', name: '弹幕数', color: 'rgba(255, 99, 132, 0.7)' },
        { key: 'reply', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'favorite', name: '收藏数', color: 'rgba(75, 192, 192, 0.7)' },
        { key: 'coin', name: '硬币数', color: 'rgba(153, 102, 255, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 159, 64, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' },
        { key: 'recommend', name: '推荐数', color: 'rgba(255, 99, 132, 0.7)' }
    ];

    // 准备数据集 - 处理缺失数据的情况
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => {
                return getMetricValue(video.stat, metric.key, video.platform);
            }),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => {
            return {
                label: metric.name,
                data: displayVideos.map(video => {
                    return getMetricValue(video.stat, metric.key, video.platform);
                }),
                backgroundColor: metric.color,
                borderColor: metric.color.replace('0.7', '1'),
                borderWidth: 1
            };
        });
    }


    // 获取或创建图表
    const canvasId = 'mixed-video-stats-chart'; // 使用混合平台专用的canvas ID
    console.log('Trying to get canvas element with ID:', canvasId);

    // 尝试多种方式获取canvas元素
    let canvasElement = document.getElementById(canvasId);

    // 如果通过ID没找到，尝试通过类名查找
    if (!canvasElement) {
        const canvasElements = document.querySelectorAll('canvas.chart-wrapper');
        if (canvasElements.length > 0) {
            canvasElement = canvasElements[canvasElements.length - 1]; // 获取最后一个
        }
    }


    // 检查canvas元素是否存在
    if (!canvasElement) {
        console.error('Canvas element not found with ID:', canvasId);
        // 尝试创建一个新的canvas元素
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
            canvasElement = document.createElement('canvas');
            canvasElement.id = canvasId;
            canvasElement.className = 'chart-wrapper';
            chartContainer.innerHTML = ''; // 清空容器
            chartContainer.appendChild(canvasElement);
            console.log('Created new canvas element:', canvasElement);
        } else {
            return;
        }
    }

    // 检查canvas元素是否可见
    const computedStyle = window.getComputedStyle(canvasElement);
    console.log('Canvas computed style:', {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: computedStyle.opacity,
        width: computedStyle.width,
        height: computedStyle.height
    });

    // 检查canvas元素的尺寸
    console.log('Canvas dimensions:', {
        offsetWidth: canvasElement.offsetWidth,
        offsetHeight: canvasElement.offsetHeight,
        clientWidth: canvasElement.clientWidth,
        clientHeight: canvasElement.clientHeight,
        scrollWidth: canvasElement.scrollWidth,
        scrollHeight: canvasElement.scrollHeight
    });

    // 如果canvas尺寸为0，尝试设置默认尺寸
    if (canvasElement.offsetWidth === 0 || canvasElement.offsetHeight === 0) {
        console.warn('Canvas has zero dimensions, attempting to set default size');
        canvasElement.style.width = '100%';
        canvasElement.style.height = '400px';
        canvasElement.width = canvasElement.parentElement.offsetWidth || 800;
        canvasElement.height = 400;
        console.log('Canvas dimensions after setting default:', {
            offsetWidth: canvasElement.offsetWidth,
            offsetHeight: canvasElement.offsetHeight
        });
    }

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
        console.error('无法获取混合平台图表的canvas上下文');
        return;
    }


    // 使用混合平台专用的图表实例
    if (window.mixedVideoChart) {
        try {
            window.mixedVideoChart.destroy();
        } catch (e) {
            console.warn('销毁图表时出错:', e);
        }
        window.mixedVideoChart = null;
    }

    // 配置图表选项
    let options;
    // 获取屏幕宽度
    const screenWidth = window.innerWidth;

    // 根据屏幕宽度调整配置
    const isMobile = screenWidth < 768;
    const isSmallMobile = screenWidth < 480;

    if (chartType === 'radar') {
        // 雷达图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    title: {
                        display: !isSmallMobile, // 小屏幕不显示标题
                        text: '数量'
                    },
                    pointLabels: {
                        font: {
                            size: isMobile ? (isSmallMobile ? 8 : 10) : 12
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: isMobile ? 'bottom' : 'top',
                    labels: {
                        font: {
                            size: isMobile ? (isSmallMobile ? 10 : 11) : 12
                        },
                        boxWidth: isMobile ? 15 : 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.r !== null) {
                                label += formatNumber(context.parsed.r);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    } else {
        // 条形图和折线图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: chartType === 'bar',
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    stacked: chartType === 'bar',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '数量'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += formatNumber(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    }


    // 验证数据是否有效
    if (!labels || labels.length === 0) {
        console.warn('图表标签为空，无法创建图表');
        return;
    }

    if (!datasets || datasets.length === 0 || !datasets[0].data || datasets[0].data.length === 0) {
        console.warn('图表数据为空，无法创建图表');
        return;
    }

    // 验证Chart.js库是否已正确加载
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library is not loaded');
        return;
    }

    console.log('Chart.js version:', Chart.version);

    try {
        // 销毁现有的图表实例（如果存在）
        if (window.mixedVideoChart && typeof window.mixedVideoChart.destroy === 'function') {
            console.log('Destroying existing chart instance');
            window.mixedVideoChart.destroy();
            window.mixedVideoChart = null;
        }

        // 确保Canvas上下文被清理
        const canvas = document.getElementById(canvasId);
        if (canvas) {
            // 获取2D上下文并清空
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            // 移除可能的Chart.js事件监听器
            canvas.removeAttribute('data-chart');
        }

        console.log('Initializing new Chart instance');
        try {
            window.mixedVideoChart = new Chart(ctx, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: options
            });
        } catch (initError) {
            try {
                // 如果有旧的Chart实例引用，确保清理它
                if (window.mixedVideoChart) {
                    window.mixedVideoChart.destroy();
                }
                window.mixedVideoChart = null;
            } catch (cleanupError) {
                console.warn('Error during Chart cleanup:', cleanupError);
            }
        }

        console.log('Chart created successfully');

        // 验证图表是否真正创建成功
        if (window.mixedVideoChart) {
            console.log('Chart instance:', window.mixedVideoChart);
            console.log('Chart canvas:', window.mixedVideoChart.canvas);
            console.log('Chart config:', window.mixedVideoChart.config);
        } else {
            console.error('Chart instance is null after creation');
        }
    } catch (error) {

        // 尝试提供更详细的错误信息
        if (error.message) {
            console.error('Error message:', error.message);
        }

        // 检查是否有具体的Chart.js错误
        if (error.name) {
            console.error('Error name:', error.name);
        }
    }
}

// 格式化数字显示
function formatNumber(num) {
    if (num >= 100000000) {
        return (num / 100000000).toFixed(1) + '亿';
    } else if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    } else {
        return num.toString();
    }
}


// 添加一个函数来处理单个字段的值，提供默认值机制
function getMetricValue(stat, field, platform) {
    // 处理字段映射：快手和小红书的comment映射到reply
    if ((platform === 'kuaishou' || platform === 'xiaohongshu') && field === 'reply') {
        const commentValue = stat['comment'];
        if (commentValue !== '-' && commentValue !== undefined && commentValue !== null && !isNaN(Number(commentValue))) {
            return Number(commentValue);
        }
    }

    // 先检查字段是否存在且有效
    const value = stat[field];
    if (value !== '-' && value !== undefined && value !== null && !isNaN(Number(value))) {
        return Number(value);
    }

    // 对于特定平台的特有字段，根据平台特性提供不同的默认值策略
    // 例如：B站的danmaku字段和抖音的recommend字段
    const platformDefaults = {
        bilibili: { danmaku: 0, coin: 0 },
        douyin: { recommend: 0 },
        kuaishou: { view: 0, like: 0, comment: 0, share: 0 },
        xiaohongshu: { like: 0, comment: 0, share: 0, favorite: 0 }
    };

    // 返回特定平台的默认值或通用默认值0
    return platformDefaults[platform] && platformDefaults[platform][field] !== undefined
        ? platformDefaults[platform][field]
        : 0;
}