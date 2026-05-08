// 渲染统计图表
function renderBiliChart(chartType = 'bar', limit = '5', dimension = 'all') {
    // 获取有效的视频数据
    const validVideos = window.allResults.filter(video => {
        if (!video || !video.stat) return false;
        const requiredFields = ['view', 'danmaku', 'reply', 'favorite', 'coin', 'share', 'like'];
        return requiredFields.every(field => {
            const value = video.stat[field];
            return value !== '-' && value !== undefined && value !== null && !isNaN(Number(value));
        });
    });

    if (validVideos.length === 0) {
        return;
    }

    // 根据当前选择的维度排序并限制数量
    let displayVideos = [...validVideos];

    // 如果选择了单一维度，则按该维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => {
            return Number(b.stat[dimension]) - Number(a.stat[dimension]);
        });
    } else {
        // 否则按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备图表数据
    const labels = displayVideos.map(video => {
        // 截断过长的标题
        return video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title;
    });

    // 指标配置
    const metrics = [
        { key: 'view', name: '播放量', color: 'rgba(54, 162, 235, 0.7)' },
        { key: 'danmaku', name: '弹幕数', color: 'rgba(255, 99, 132, 0.7)' },
        { key: 'reply', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'favorite', name: '收藏数', color: 'rgba(75, 192, 192, 0.7)' },
        { key: 'coin', name: '硬币数', color: 'rgba(153, 102, 255, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 159, 64, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' }
    ];

    // 准备数据集 - 如果选择单一维度则只显示该维度数据
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => Number(video.stat[metric.key])),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => {
            return {
                label: metric.name,
                data: displayVideos.map(video => Number(video.stat[metric.key])),
                backgroundColor: metric.color,
                borderColor: metric.color.replace('0.7', '1'),
                borderWidth: 1
            };
        });
    }

    // 获取或创建图表
    const ctx = document.getElementById('video-stats-chart').getContext('2d');
    if (window.videoChart) {
        window.videoChart.destroy();
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

    // 创建图表
    window.videoChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: options
    });
}

// 渲染最近B站数据的图表
function renderRecentBiliChart(chartType = 'bar', limit = '5', dimension = 'all') {
    const validVideos = window.recentResults || [];

    if (validVideos.length === 0) return;

    let displayVideos = [...validVideos];

    // 按选择的维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => Number(b.stat[dimension]) - Number(a.stat[dimension]));
    } else {
        // 按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备标签（视频标题）
    const labels = displayVideos.map(video =>
        video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title
    );

    // B站指标配置
    const metrics = [
        { key: 'view', name: '播放量', color: 'rgba(54, 162, 235, 0.7)' },
        { key: 'danmaku', name: '弹幕数', color: 'rgba(255, 99, 132, 0.7)' },
        { key: 'reply', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'favorite', name: '收藏数', color: 'rgba(75, 192, 192, 0.7)' },
        { key: 'coin', name: '硬币数', color: 'rgba(153, 102, 255, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 159, 64, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' }
    ];

    // 准备数据集
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => Number(video.stat[metric.key])),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => ({
            label: metric.name,
            data: displayVideos.map(video => Number(video.stat[metric.key])),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }));
    }

    // 创建或更新图表
    const ctx = document.getElementById('recent-video-stats-chart').getContext('2d');
    if (window.recentVideoChart) {
        window.recentVideoChart.destroy();
    }

    let options;
    // 获取屏幕宽度
    const screenWidth = window.innerWidth;

    // 根据屏幕宽度调整配置
    const isMobile = screenWidth < 768;
    const isSmallMobile = screenWidth < 480;

    if (chartType === 'radar' || chartType === 'polarArea') {
        // 雷达图和极坐标图配置
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
                            if (label) label += ': ';
                            if (context.parsed.r !== null) {
                                label += formatNumber(context.parsed.r);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    } else if (chartType === 'pie' || chartType === 'doughnut') {
        // 饼图和环形图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
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
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                label += formatNumber(context.parsed);
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
                    title: { display: true, text: '数量' }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
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

    window.recentVideoChart = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        options
    });
}

// 渲染最近抖音数据的图表
function renderRecentDouyinChart(chartType = 'bar', limit = '5', dimension = 'all') {
    const validVideos = window.recentResults || [];

    if (validVideos.length === 0) return;

    let displayVideos = [...validVideos];

    // 按选择的维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => Number(b.stat[dimension]) - Number(a.stat[dimension]));
    } else {
        // 按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备标签（视频标题）
    const labels = displayVideos.map(video =>
        video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title
    );

    // 抖音指标配置
    const metrics = [
        { key: 'reply', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'favorite', name: '收藏数', color: 'rgba(75, 192, 192, 0.7)' },
        { key: 'recommend', name: '推荐数', color: 'rgba(153, 102, 255, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 159, 64, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' }
    ];

    // 准备数据集
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => Number(video.stat[metric.key])),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => ({
            label: metric.name,
            data: displayVideos.map(video => Number(video.stat[metric.key])),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }));
    }

    // 创建或更新图表
    const ctx = document.getElementById('recent-video-stats-chart').getContext('2d');
    if (window.recentVideoChart) {
        window.recentVideoChart.destroy();
    }

    let options;
    // 获取屏幕宽度
    const screenWidth = window.innerWidth;

    // 根据屏幕宽度调整配置
    const isMobile = screenWidth < 768;
    const isSmallMobile = screenWidth < 480;

    if (chartType === 'radar' || chartType === 'polarArea') {
        // 雷达图和极坐标图配置
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
                            if (label) label += ': ';
                            if (context.parsed.r !== null) {
                                label += formatNumber(context.parsed.r);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    } else if (chartType === 'pie' || chartType === 'doughnut') {
        // 饼图和环形图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
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
                            let label = context.label || '';
                            if (label) label += ': ';
                            if (context.parsed !== null) {
                                label += formatNumber(context.parsed);
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
                    title: { display: true, text: '数量' }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
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

    window.recentVideoChart = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        options
    });
}

// 渲染统计图表
function renderDouyinChart(chartType = 'bar', limit = '5', dimension = 'all') {
    // 获取有效的视频数据
    const validVideos = window.allResults.filter(video => {
        if (!video || !video.stat) return false;
        const requiredFields = ['reply', 'favorite', 'recommend', 'share', 'like'];
        return requiredFields.every(field => {
            const value = video.stat[field];
            return value !== '-' && value !== undefined && value !== null && !isNaN(Number(value));
        });
    });

    if (validVideos.length === 0) {
        return;
    }

    // 根据当前选择的维度排序并限制数量
    let displayVideos = [...validVideos];

    // 如果选择了单一维度，则按该维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => {
            return Number(b.stat[dimension]) - Number(a.stat[dimension]);
        });
    } else {
        // 否则按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备图表数据
    const labels = displayVideos.map(video => {
        // 截断过长的标题
        return video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title;
    });

    // 指标配置
    const metrics = [
        { key: 'reply', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'favorite', name: '收藏数', color: 'rgba(75, 192, 192, 0.7)' },
        { key: 'recommend', name: '推荐数', color: 'rgba(153, 102, 255, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 159, 64, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' }
    ];

    // 准备数据集 - 如果选择单一维度则只显示该维度数据
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => Number(video.stat[metric.key])),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => {
            return {
                label: metric.name,
                data: displayVideos.map(video => Number(video.stat[metric.key])),
                backgroundColor: metric.color,
                borderColor: metric.color.replace('0.7', '1'),
                borderWidth: 1
            };
        });
    }

    // 获取或创建图表
    const ctx = document.getElementById('video-stats-chart').getContext('2d');
    if (window.videoChart) {
        window.videoChart.destroy();
    }

    // 配置图表选项
    let options;
    const screenWidth = window.innerWidth;
    const isMobile = screenWidth < 768;
    const isSmallMobile = screenWidth < 480;

    if (chartType === 'radar' || chartType === 'polarArea') {
        // 雷达图和极坐标图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '数量'
                    },
                    pointLabels: {
                        font: {
                            size: 12
                        }
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
                            if (context.parsed.r !== null) {
                                label += formatNumber(context.parsed.r);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    } else if (chartType === 'pie' || chartType === 'doughnut') {
        // 饼图和环形图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += formatNumber(context.parsed);
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

    // 创建图表
    window.videoChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: options
    });
}

// 渲染小红书图表
function renderXiaohongshuChart(chartType = 'bar', limit = '5', dimension = 'all') {
    // 获取有效的视频数据
    const validVideos = window.allResults.filter(video => {
        if (!video || !video.stat) return false;
        // 小红书有效字段：like, comment, share
        const coreFields = ['like', 'comment', 'share'];
        return coreFields.some(field => {
            const value = video.stat[field];
            return value !== '-' && value !== undefined && value !== null && !isNaN(Number(value));
        });
    });

    if (validVideos.length === 0) {
        return;
    }

    // 根据当前选择的维度排序并限制数量
    let displayVideos = [...validVideos];

    // 如果选择了单一维度，则按该维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => {
            const valA = (a.stat[dimension] === '-' || isNaN(Number(a.stat[dimension]))) ? 0 : Number(a.stat[dimension]);
            const valB = (b.stat[dimension] === '-' || isNaN(Number(b.stat[dimension]))) ? 0 : Number(b.stat[dimension]);
            return valB - valA;
        });
    } else {
        // 否则按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备图表数据
    const labels = displayVideos.map(video => {
        // 截断过长的标题
        return video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title;
    });

    // 小红书指标配置
    const allMetrics = [
        { key: 'like', name: '点赞数', color: 'rgba(255, 36, 66, 0.7)' },
        { key: 'comment', name: '评论数', color: 'rgba(54, 162, 235, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 206, 86, 0.7)' }
    ];

    // 过滤掉指标
    const metrics = allMetrics.filter(metric => {
        if (dimension !== 'all' && metric.key === dimension) return true;
        if (dimension !== 'all' && metric.key !== dimension) return false;

        const isMetricValidForAllVideos = displayVideos.every(video => {
            const val = video.stat[metric.key];
            return val !== '-' && val !== undefined && val !== null && !isNaN(Number(val));
        });
        return isMetricValidForAllVideos;
    });

    // 准备数据集
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        if (!metric) return;

        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => {
                const val = video.stat[metric.key];
                return (val === '-' || isNaN(Number(val))) ? 0 : Number(val);
            }),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => ({
            label: metric.name,
            data: displayVideos.map(video => {
                const val = video.stat[metric.key];
                return (val === '-' || isNaN(Number(val))) ? 0 : Number(val);
            }),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }));
    }

    // 获取或创建图表
    const ctx = document.getElementById('video-stats-chart').getContext('2d');
    if (window.videoChart) {
        window.videoChart.destroy();
    }

    // 配置图表选项
    let options;
    const screenWidth = window.innerWidth;
    const isMobile = screenWidth < 768;
    const isSmallMobile = screenWidth < 480;

    if (chartType === 'radar' || chartType === 'polarArea') {
        // 雷达图和极坐标图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '数量'
                    },
                    pointLabels: {
                        font: {
                            size: 12
                        }
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
                            if (context.parsed.r !== null) {
                                label += formatNumber(context.parsed.r);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    } else if (chartType === 'pie' || chartType === 'doughnut') {
        // 饼图和环形图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += formatNumber(context.parsed);
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

    // 创建图表
    window.videoChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: options
    });
}

// 渲染快手图表
function renderKuaishouChart(chartType = 'bar', limit = '5', dimension = 'all') {
    // 获取有效的视频数据
    const validVideos = window.allResults.filter(video => {
        if (!video || !video.stat) return false;
        // 只要view, like, comment中有一个有效即可，share可以是'-'
        const coreFields = ['view', 'like', 'comment'];
        return coreFields.some(field => {
            const value = video.stat[field];
            return value !== '-' && value !== undefined && value !== null && !isNaN(Number(value));
        });
    });

    if (validVideos.length === 0) {
        return;
    }

    // 根据当前选择的维度排序并限制数量
    let displayVideos = [...validVideos];

    // 如果选择了单一维度，则按该维度排序
    if (dimension !== 'all') {
        displayVideos.sort((a, b) => {
            const valA = (a.stat[dimension] === '-' || isNaN(Number(a.stat[dimension]))) ? 0 : Number(a.stat[dimension]);
            const valB = (b.stat[dimension] === '-' || isNaN(Number(b.stat[dimension]))) ? 0 : Number(b.stat[dimension]);
            return valB - valA;
        });
    } else {
        // 否则按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备图表数据
    const labels = displayVideos.map(video => {
        // 截断过长的标题
        return video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title;
    });

    // 指标配置
    const allMetrics = [
        { key: 'view', name: '播放量', color: 'rgba(54, 162, 235, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' },
        { key: 'comment', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(255, 159, 64, 0.7)' }
    ];

    // 过滤掉指标：如果有任意一个视频的该指标数据为'-'或无效，则在整个图表中过滤掉该指标
    const metrics = allMetrics.filter(metric => {
        // 如果用户明确选择了某个维度，则不过滤该维度
        if (dimension !== 'all' && metric.key === dimension) return true;
        if (dimension !== 'all' && metric.key !== dimension) return false;

        // 在'all'维度下，检查该指标是否在所有视频中都有效
        const isMetricValidForAllVideos = displayVideos.every(video => {
            const val = video.stat[metric.key];
            return val !== '-' && val !== undefined && val !== null && !isNaN(Number(val));
        });
        return isMetricValidForAllVideos;
    });

    // 准备数据集 - 如果选择单一维度则只显示该维度数据
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        if (!metric) return;

        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => {
                const val = video.stat[metric.key];
                return (val === '-' || isNaN(Number(val))) ? 0 : Number(val);
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
                    const val = video.stat[metric.key];
                    return (val === '-' || isNaN(Number(val))) ? 0 : Number(val);
                }),
                backgroundColor: metric.color,
                borderColor: metric.color.replace('0.7', '1'),
                borderWidth: 1
            };
        });
    }

    // 获取或创建图表
    const ctx = document.getElementById('video-stats-chart').getContext('2d');
    if (window.videoChart) {
        window.videoChart.destroy();
    }

    // 配置图表选项
    let options;
    const screenWidth = window.innerWidth;
    const isMobile = screenWidth < 768;
    const isSmallMobile = screenWidth < 480;

    if (chartType === 'radar' || chartType === 'polarArea') {
        // 雷达图和极坐标图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '数量'
                    },
                    pointLabels: {
                        font: {
                            size: 12
                        }
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
                            if (context.parsed.r !== null) {
                                label += formatNumber(context.parsed.r);
                            }
                            return label;
                        }
                    }
                }
            }
        };
    } else if (chartType === 'pie' || chartType === 'doughnut') {
        // 饼图和环形图配置
        options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += formatNumber(context.parsed);
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

    // 创建图表
    window.videoChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: options
    });
}

// 渲染最近快手数据的图表
function renderRecentKuaishouChart(chartType = 'bar', limit = '5', dimension = 'all') {
    // 获取有效的视频数据
    const validVideos = (window.recentResults || []).filter(video => {
        if (!video || !video.stat) return false;
        // 只要view, like, comment中有一个有效即可，share可以是'-'
        const coreFields = ['view', 'like', 'comment'];
        return coreFields.some(field => {
            const value = video.stat[field];
            return value !== '-' && value !== undefined && value !== null && !isNaN(Number(value));
        });
    });

    if (validVideos.length === 0) return;

    let displayVideos = [...validVideos];

    // 按选择的维度排序
    if (dimension !== 'all') {
        // 如果排序维度的数据无效，则将其视为0
        displayVideos.sort((a, b) => {
            const valA = (a.stat[dimension] === '-' || isNaN(Number(a.stat[dimension]))) ? 0 : Number(a.stat[dimension]);
            const valB = (b.stat[dimension] === '-' || isNaN(Number(b.stat[dimension]))) ? 0 : Number(b.stat[dimension]);
            return valB - valA;
        });
    } else {
        // 按综合得分排序
        displayVideos.sort((a, b) => {
            const scoreA = a.totalScore || 0;
            const scoreB = b.totalScore || 0;
            return scoreB - scoreA;
        });
    }

    // 应用数量限制
    if (limit !== 'all') {
        displayVideos = displayVideos.slice(0, parseInt(limit));
    }

    // 准备标签（视频标题）
    const labels = displayVideos.map(video =>
        video.title.length > 15 ? video.title.substring(0, 15) + '...' : video.title
    );

    // 快手指标配置
    const allMetrics = [
        { key: 'view', name: '播放量', color: 'rgba(54, 162, 235, 0.7)' },
        { key: 'like', name: '点赞数', color: 'rgba(23, 162, 184, 0.7)' },
        { key: 'comment', name: '评论数', color: 'rgba(255, 206, 86, 0.7)' },
        { key: 'share', name: '分享数', color: 'rgba(75, 192, 192, 0.7)' }
    ];

    // 过滤掉指标：如果有任意一个视频的该指标数据为'-'或无效，则在整个图表中过滤掉该指标
    const metrics = allMetrics.filter(metric => {
        // 如果用户明确选择了某个维度，则不过滤该维度（即使数据可能为空，由后续逻辑处理为0）
        if (dimension !== 'all' && metric.key === dimension) return true;
        if (dimension !== 'all' && metric.key !== dimension) return false;

        // 在'all'维度下，检查该指标是否在所有视频中都有效
        // 只要有一个视频的该指标为'-'或无效，就过滤掉整个指标
        const isMetricValidForAllVideos = displayVideos.every(video => {
            const val = video.stat[metric.key];
            return val !== '-' && val !== undefined && val !== null && !isNaN(Number(val));
        });

        return isMetricValidForAllVideos;
    });

    // 准备数据集
    let datasets;
    if (dimension !== 'all') {
        const metric = metrics.find(m => m.key === dimension);
        // 如果选择的维度被过滤掉了（说明所有数据都是'-'），则依然需要显示一个空图表或提示
        if (!metric) return; 

        datasets = [{
            label: metric.name,
            data: displayVideos.map(video => {
                const val = video.stat[metric.key];
                return (val === '-' || isNaN(Number(val))) ? 0 : Number(val);
            }),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }];
    } else {
        datasets = metrics.map(metric => ({
            label: metric.name,
            data: displayVideos.map(video => {
                const val = video.stat[metric.key];
                return (val === '-' || isNaN(Number(val))) ? 0 : Number(val);
            }),
            backgroundColor: metric.color,
            borderColor: metric.color.replace('0.7', '1'),
            borderWidth: 1
        }));
    }

    const ctx = document.getElementById('recent-video-stats-chart').getContext('2d');
    
    // 销毁旧图表
    if (window.recentVideoChart) {
        window.recentVideoChart.destroy();
    }

    // 创建新图表
    window.recentVideoChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: dimension === 'all' 
                        ? '快手视频多维度数据对比' 
                        : `快手视频${metrics.find(m => m.key === dimension)?.name || ''}对比`
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}


// 图片导出功能

/**
 * 导出Canvas为图片
 * @param {string} canvasId - Canvas元素的ID
 * @param {string} format - 导出格式，支持png和jpeg
 * @param {number} quality - 图片质量，0-1，仅对jpeg有效
 * @returns {Promise<string>} - 返回图片的DataURL
 */
function exportChart(canvasId, format = 'png', quality = 0.9) {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            reject(new Error('Canvas element not found'));
            return;
        }

        // 确保格式有效
        const validFormats = ['png', 'jpeg'];
        format = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'png';

        try {
            if (format === 'png') {
                // PNG格式导出
                const dataUrl = canvas.toDataURL('image/png');
                resolve(dataUrl);
            } else {
                // JPEG格式导出
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            }
        } catch (error) {
            reject(new Error('Failed to export chart: ' + error.message));
        }
    });
}

/**
 * 使用Blob API导出Canvas为图片，适合大尺寸Canvas
 * @param {string} canvasId - Canvas元素的ID
 * @param {string} format - 导出格式，支持png和jpeg
 * @param {number} quality - 图片质量，0-1，仅对jpeg有效
 * @returns {Promise<Blob>} - 返回图片的Blob对象
 */
function exportChartAsBlob(canvasId, format = 'png', quality = 0.9) {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            reject(new Error('Canvas element not found'));
            return;
        }

        // 确保格式有效
        const validFormats = ['png', 'jpeg'];
        format = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'png';

        try {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob from canvas'));
                    }
                },
                `image/${format}`,
                quality
            );
        } catch (error) {
            reject(new Error('Failed to export chart as blob: ' + error.message));
        }
    });
}

/**
 * 下载图片
 * @param {string|Blob} data - 图片数据，可以是DataURL或Blob对象
 * @param {string} filename - 下载的文件名
 * @param {string} format - 图片格式，支持png和jpeg
 */
function downloadImage(data, filename, format = 'png') {
    const link = document.createElement('a');
    link.style.display = 'none';

    if (typeof data === 'string') {
        // DataURL方式
        link.href = data;
    } else {
        // Blob方式
        link.href = URL.createObjectURL(data);
    }

    // 设置文件名
    const timestamp = new Date().getTime();
    link.download = `${filename}_${timestamp}.${format}`;

    // 添加到文档并点击
    document.body.appendChild(link);
    link.click();

    // 清理
    document.body.removeChild(link);

    // 如果是Blob方式，释放URL对象
    if (typeof data !== 'string') {
        URL.revokeObjectURL(link.href);
    }
}

/**
 * 导出完整页面为图片
 * @param {string} format - 导出格式，支持png和jpeg
 * @param {number} quality - 图片质量，0-1，仅对jpeg有效
 */
async function exportFullPage(format = 'png', quality = 0.9) {
    // 创建一个临时Canvas
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    // 获取页面尺寸
    const pageWidth = document.body.scrollWidth;
    const pageHeight = document.body.scrollHeight;

    // 设置Canvas尺寸
    tempCanvas.width = pageWidth;
    tempCanvas.height = pageHeight;

    try {
        // 绘制页面背景
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, pageWidth, pageHeight);

        // 获取所有Canvas元素
        const canvases = document.querySelectorAll('canvas');

        // 遍历所有Canvas，绘制到临时Canvas上
        for (let i = 0; i < canvases.length; i++) {
            const canvas = canvases[i];
            const rect = canvas.getBoundingClientRect();

            // 获取Canvas的位置（考虑滚动偏移）
            const x = rect.left + window.scrollX;
            const y = rect.top + window.scrollY;

            // 绘制Canvas到临时Canvas
            tempCtx.drawImage(canvas, x, y, rect.width, rect.height);
        }

        // 导出临时Canvas为图片
        if (format === 'png') {
            const dataUrl = tempCanvas.toDataURL('image/png');
            downloadImage(dataUrl, 'full_page', 'png');
        } else {
            tempCanvas.toBlob(
                (blob) => {
                    if (blob) {
                        downloadImage(blob, 'full_page', 'jpeg');
                    }
                },
                'image/jpeg',
                quality
            );
        }
    } catch (error) {
        console.error('Failed to export full page:', error);
        alert('导出页面失败：' + error.message);
    } finally {
        // 清理内存
        tempCanvas.width = 0;
        tempCanvas.height = 0;
    }
}

/**
 * 初始化图片导出功能
 */
function initExportFunctionality() {
    // 为B站和抖音图表添加导出事件监听
    const addExportListeners = (exportChartId, exportPageId, canvasId, formatId) => {
        const exportChartBtn = document.getElementById(exportChartId);
        const exportPageBtn = document.getElementById(exportPageId);
        const formatSelect = document.getElementById(formatId);

        if (exportChartBtn) {
            exportChartBtn.addEventListener('click', async () => {
                const format = formatSelect?.value || 'png';
                try {
                    // 对于大尺寸Canvas使用Blob API
                    const canvas = document.getElementById(canvasId);
                    if (canvas && (canvas.width > 2000 || canvas.height > 2000)) {
                        // 大尺寸Canvas使用Blob API
                        const blob = await exportChartAsBlob(canvasId, format, 0.9);
                        downloadImage(blob, 'chart', format);
                    } else {
                        // 小尺寸Canvas使用DataURL API
                        const dataUrl = await exportChart(canvasId, format, 0.9);
                        downloadImage(dataUrl, 'chart', format);
                    }
                } catch (error) {
                    console.error('Failed to export chart:', error);
                    alert('导出图表失败：' + error.message);
                }
            });
        }

        if (exportPageBtn) {
            exportPageBtn.addEventListener('click', () => {
                const format = formatSelect?.value || 'png';
                exportFullPage(format, 0.9);
            });
        }
    };

    // 添加事件监听
    addExportListeners('export-chart', 'export-page', 'video-stats-chart', 'export-format');
    addExportListeners('export-recent-chart', 'export-recent-page', 'recent-video-stats-chart', 'recent-export-format');
}


// 页面加载完成后初始化导出功能
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExportFunctionality);
} else {
    initExportFunctionality();
}
